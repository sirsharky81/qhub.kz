import { getPublicOrigin } from "@/lib/public-origin";
import { getSendTransfer, verifySendPassword } from "@/lib/send/store";
import { assertPublicHttpsUrl } from "./allowlist";
import {
  assertDirectMediaUrl,
  assertNotYoutube,
  CastGuardError,
  detectContentTypeFromUrl,
  isVideoMime,
} from "./guard";
import { signCastStreamToken } from "./proxy-token";
import type { CastResolvedMedia } from "./types";
import { buildCastStreamUrl, parseSendShareInput } from "./urls";
import { getCastUploadRecord, toCastUploadPublicMeta } from "./upload-store";

export class CastResolveError extends Error {
  constructor(
    message: string,
    readonly code: string = "resolve_failed",
  ) {
    super(message);
    this.name = "CastResolveError";
  }
}

export async function resolveCastInput(
  input: string,
  options?: { password?: string; origin?: string; uploadId?: string },
): Promise<CastResolvedMedia> {
  const trimmed = input.trim();
  const origin = options?.origin ?? getPublicOrigin();

  if (options?.uploadId) {
    return resolveCastUpload(options.uploadId, origin);
  }

  if (!trimmed) {
    throw new CastResolveError("Укажите ссылку", "empty_input");
  }

  assertNotYoutube(trimmed);

  const sendShareId = parseSendShareInput(trimmed);
  if (sendShareId) {
    return resolveCastSend(sendShareId, options?.password, origin);
  }

  return resolveCastDirectUrl(trimmed, origin);
}

async function resolveCastDirectUrl(url: string, origin: string): Promise<CastResolvedMedia> {
  const contentType = assertDirectMediaUrl(url);
  assertPublicHttpsUrl(url);

  const token = await signCastStreamToken({
    upstreamKind: "url",
    upstreamRef: url.trim(),
    contentType,
    title: filenameFromUrl(url),
  });

  return {
    title: filenameFromUrl(url),
    streamUrl: buildCastStreamUrl(token, origin),
    contentType,
    source: "url",
  };
}

async function resolveCastSend(
  shareId: string,
  password: string | undefined,
  origin: string,
): Promise<CastResolvedMedia> {
  const transfer = await getSendTransfer(shareId);
  if (!transfer) {
    throw new CastResolveError("Send-ссылка не найдена или истекла", "send_not_found");
  }
  if (transfer.revoked) {
    throw new CastResolveError("Send-ссылка отозвана", "send_revoked");
  }
  if (transfer.expiresAt <= Date.now()) {
    throw new CastResolveError("Send-ссылка истекла", "send_expired");
  }
  if (transfer.maxDownloads !== null && transfer.downloadCount >= transfer.maxDownloads) {
    throw new CastResolveError("Send-ссылка уже использована", "send_exhausted");
  }
  if (!isVideoMime(transfer.mime)) {
    throw new CastResolveError("Файл Send не является видео", "not_video");
  }

  const warnings: string[] = [];
  if (transfer.maxDownloads === 1) {
    warnings.push("Одноразовая Send-ссылка будет использована при начале воспроизведения на TV");
  }

  if (transfer.passwordHash) {
    const provided = password?.trim() ?? "";
    if (!provided) {
      throw new CastResolveError("Требуется пароль Send-ссылки", "send_password_required");
    }
    const ok = await verifySendPassword(transfer, provided);
    if (!ok) {
      throw new CastResolveError("Неверный пароль Send-ссылки", "send_password_invalid");
    }
  }

  // The signed stream token is only issued after the password check above passes,
  // so the token itself is proof of authorization — the stream endpoint does not
  // need to (and cannot, since Send hashes are salted per-password) re-check it.
  const contentType = transfer.mime || "video/mp4";
  const token = await signCastStreamToken({
    upstreamKind: "send",
    upstreamRef: { shareId },
    contentType,
    title: transfer.filename,
  });

  return {
    title: transfer.filename,
    streamUrl: buildCastStreamUrl(token, origin),
    contentType,
    source: "send",
    warnings: warnings.length ? warnings : undefined,
  };
}

export async function resolveCastUpload(uploadId: string, origin: string): Promise<CastResolvedMedia> {
  const record = await getCastUploadRecord(uploadId);
  if (!record) {
    throw new CastResolveError("Загрузка не найдена или истекла", "upload_not_found");
  }
  if (!isVideoMime(record.mime)) {
    throw new CastResolveError("Загруженный файл не является видео", "not_video");
  }

  const token = await signCastStreamToken({
    upstreamKind: "upload",
    upstreamRef: { uploadId: record.uploadId },
    contentType: record.mime,
    title: record.filename,
  });

  return {
    title: record.filename,
    streamUrl: buildCastStreamUrl(token, origin),
    contentType: record.mime,
    source: "upload",
  };
}

export function resolveCastUploadMeta(uploadId: string) {
  return getCastUploadRecord(uploadId).then((r) => (r ? toCastUploadPublicMeta(r) : null));
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop();
    if (base && base.length > 0) return decodeURIComponent(base);
  } catch {
    /* ignore */
  }
  const ct = detectContentTypeFromUrl(url);
  if (ct?.includes("mpegURL")) return "Поток HLS";
  return "Видео";
}

export function mapCastError(err: unknown): CastResolveError {
  if (err instanceof CastResolveError) return err;
  if (err instanceof CastGuardError) {
    return new CastResolveError(err.message, err.code);
  }
  if (err instanceof Error) {
    return new CastResolveError(err.message, "resolve_failed");
  }
  return new CastResolveError("Не удалось обработать ссылку", "resolve_failed");
}
