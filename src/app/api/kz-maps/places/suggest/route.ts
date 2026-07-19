import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getClientIp, checkKzMapsSuggestRateLimit } from "@/lib/rate-limit";
import { savePendingSuggestion } from "@/lib/kz-maps/pending-store";
import type { KzPlaceCategory } from "@/lib/kz-maps/types";

const VALID_CATEGORIES = new Set<KzPlaceCategory>([
  "nature",
  "viewpoint",
  "waterfall",
  "lake",
  "petroglyphs",
  "historic",
  "trail",
  "urban",
]);

interface Body {
  name?: string;
  lat?: number;
  lng?: number;
  region?: string;
  category?: string;
  summary?: string;
  submitterName?: string;
  submitterContact?: string;
  website?: string;
}

export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = await request.json();
    } catch {
      return withCors(NextResponse.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    if (body.website) {
      return withCors(NextResponse.json({ ok: true }), request);
    }

    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkKzMapsSuggestRateLimit(ip);
    if (!allowed) {
      return withCors(
        NextResponse.json({ error: "Слишком много отправок. Попробуйте позже." }, {
          status: 429,
          headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
        }),
        request,
      );
    }

    const name = body.name?.trim().slice(0, 120) ?? "";
    const summary = body.summary?.trim().slice(0, 800) ?? "";
    const region = body.region?.trim().slice(0, 64) ?? "";
    const category = body.category as KzPlaceCategory;
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (name.length < 2) {
      return withCors(NextResponse.json({ error: "Укажите название места" }, { status: 400 }), request);
    }
    if (summary.length < 20) {
      return withCors(
        NextResponse.json({ error: "Описание — минимум 20 символов" }, { status: 400 }),
        request,
      );
    }
    if (!region) {
      return withCors(NextResponse.json({ error: "Выберите регион" }, { status: 400 }), request);
    }
    if (!VALID_CATEGORIES.has(category)) {
      return withCors(NextResponse.json({ error: "Некорректная категория" }, { status: 400 }), request);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return withCors(NextResponse.json({ error: "Укажите координаты" }, { status: 400 }), request);
    }

    const entry = await savePendingSuggestion({
      name,
      lat,
      lng,
      region,
      category,
      summary,
      submitterName: body.submitterName?.trim().slice(0, 80),
      submitterContact: body.submitterContact?.trim().slice(0, 80),
    });

    return withCors(
      NextResponse.json({ ok: true, id: entry.id, message: "Спасибо! Место отправлено на модерацию." }),
      request,
    );
  } catch (e) {
    const msg = e instanceof Error && e.message === "redis_unavailable"
      ? "Сервис временно недоступен"
      : "Не удалось отправить";
    return withCors(NextResponse.json({ error: msg }, { status: 503 }), request);
  }
}
