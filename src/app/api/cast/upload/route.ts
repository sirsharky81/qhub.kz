import { withCors } from "@/lib/api/cors";
import {
  CAST_MAX_UPLOAD_BYTES_DESKTOP,
  CAST_MAX_UPLOAD_BYTES_MOBILE,
} from "@/lib/cast/constants";
import { resolveCastUpload } from "@/lib/cast/resolve";
import { buildCastWatchUrl } from "@/lib/cast/urls";
import { createCastUploadRecord, toCastUploadPublicMeta } from "@/lib/cast/upload-store";
import { isVideoMime } from "@/lib/cast/guard";
import { getPublicOrigin } from "@/lib/public-origin";
import { checkCastUploadRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

function maxUploadBytes(request: Request): number {
  const ua = request.headers.get("user-agent")?.toLowerCase() ?? "";
  const mobile = /android|iphone|ipad|mobile/.test(ua);
  return mobile ? CAST_MAX_UPLOAD_BYTES_MOBILE : CAST_MAX_UPLOAD_BYTES_DESKTOP;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkCastUploadRateLimit(`upload:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много загрузок" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return withCors(Response.json({ error: "Файл не передан" }, { status: 400 }), request);
    }

    const limit = maxUploadBytes(request);
    if (file.size <= 0) {
      return withCors(Response.json({ error: "Пустой файл" }, { status: 400 }), request);
    }
    if (file.size > limit) {
      return withCors(
        Response.json(
          { error: `Файл слишком большой (макс. ${Math.round(limit / (1024 * 1024))} МБ)` },
          { status: 413 },
        ),
        request,
      );
    }

    const mime = file.type || "application/octet-stream";
    if (!isVideoMime(mime)) {
      return withCors(Response.json({ error: "Поддерживаются только видеофайлы" }, { status: 400 }), request);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const record = await createCastUploadRecord(file.name || "video.mp4", mime, file.size, buffer);
    const origin = getPublicOrigin(request);
    const resolved = await resolveCastUpload(record.uploadId, origin);

    return withCors(
      Response.json({
        upload: toCastUploadPublicMeta(record),
        media: resolved,
        watchUrl: buildCastWatchUrl({ uploadId: record.uploadId }, origin),
      }),
      request,
    );
  } catch (err) {
    console.error("[cast/upload]", err);
    return withCors(Response.json({ error: "Не удалось загрузить файл" }, { status: 500 }), request);
  }
}
