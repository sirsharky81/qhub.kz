import { NextResponse } from "next/server";
import { checkAudioExtractorRateLimit, getClientIp } from "@/lib/rate-limit";
import { validateExtractorUrl } from "@/lib/audio-extractor/url-validator";
import { YtdlpError } from "@/lib/audio-extractor/ytdlp";

export function jsonError(message: string, status: number, retryAfterSec?: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
    },
  );
}

export async function parseUrlBody(request: Request): Promise<{ url: string } | NextResponse> {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Неверный формат запроса", 400);
  }

  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw) return jsonError("Укажите ссылку на видео", 400);

  try {
    const { url } = validateExtractorUrl(raw);
    return { url };
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_url";
    if (code === "unsupported_platform" || code === "unsupported_instagram_url") {
      return jsonError("Поддерживаются только YouTube, TikTok и Instagram", 400);
    }
    return jsonError("Некорректная ссылка", 400);
  }
}

export async function enforceRateLimit(request: Request): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkAudioExtractorRateLimit(ip);
  if (!allowed) {
    return jsonError("Слишком много запросов. Попробуйте через час.", 429, retryAfterSec);
  }
  return null;
}

export function mapYtdlpError(err: unknown): NextResponse {
  if (err instanceof YtdlpError) {
    switch (err.code) {
      case "too_long":
        return jsonError(err.message, 400);
      case "unavailable":
      case "blocked":
        return jsonError(err.message, 404);
      case "timeout":
        return jsonError("Видео слишком длинное или источник медленный", 504);
      case "not_found":
        return jsonError("Сервис временно недоступен", 503);
      default:
        return jsonError(err.message, 502);
    }
  }
  console.error("[audio-extractor]", err);
  return jsonError("Сервис временно недоступен", 503);
}
