import { MAX_AVATAR_BYTES } from "./constants";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ParsedAvatarUpload =
  | { ok: true; mime: string; data: string }
  | { ok: false; error: string; status: number };

function normalizeMime(raw: string): string {
  const mime = raw.trim().toLowerCase().split(";")[0] ?? "";
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function parseAvatarUploadBody(body: unknown): ParsedAvatarUpload {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Неверный формат", status: 400 };
  }
  const data = body as { data?: unknown; mime?: unknown };
  if (typeof data.data !== "string" || !data.data.trim()) {
    return { ok: false, error: "Нет данных изображения", status: 400 };
  }
  const mime = normalizeMime(typeof data.mime === "string" ? data.mime : "image/jpeg");
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "Допустимы JPEG, PNG, WebP или GIF", status: 400 };
  }
  const base64 = data.data.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    return { ok: false, error: "Некорректные данные изображения", status: 400 };
  }
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Аватар слишком большой", status: 413 };
  }
  return { ok: true, mime, data: base64 };
}

export function avatarBlobToResponse(blob: { mime: string; data: string; updatedAt: number }): Response {
  const binary = Buffer.from(blob.data, "base64");
  return new Response(binary, {
    status: 200,
    headers: {
      "Content-Type": blob.mime,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Last-Modified": new Date(blob.updatedAt).toUTCString(),
    },
  });
}
