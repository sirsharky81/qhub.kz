import { DIRECT_MEDIA_EXTENSIONS, VIDEO_MIME_PREFIX } from "./constants";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export class CastGuardError extends Error {
  constructor(
    message: string,
    readonly code:
      | "youtube_not_supported"
      | "invalid_url"
      | "not_video"
      | "unsupported_source" = "unsupported_source",
  ) {
    super(message);
    this.name = "CastGuardError";
  }
}

export function isYoutubeUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (YOUTUBE_HOSTS.has(host)) return true;
    return host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

export function assertNotYoutube(input: string): void {
  if (isYoutubeUrl(input)) {
    throw new CastGuardError(
      "YouTube вещается через приложение YouTube на TV",
      "youtube_not_supported",
    );
  }
}

export function isVideoMime(mime: string): boolean {
  return mime.toLowerCase().startsWith(VIDEO_MIME_PREFIX);
}

export function detectContentTypeFromUrl(url: string): string | null {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".m3u8")) return "application/x-mpegURL";
  if (lower.endsWith(".mpd")) return "application/dash+xml";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return null;
}

export function looksLikeDirectMediaUrl(url: string): boolean {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  return DIRECT_MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function assertDirectMediaUrl(url: string): string {
  assertNotYoutube(url);
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new CastGuardError("Некорректная ссылка", "invalid_url");
  }
  if (parsed.protocol !== "https:") {
    throw new CastGuardError("Поддерживаются только HTTPS-ссылки", "invalid_url");
  }
  if (!looksLikeDirectMediaUrl(parsed.href)) {
    throw new CastGuardError(
      "Поддерживаются прямые ссылки на видео (.mp4, .m3u8, .mpd и др.)",
      "not_video",
    );
  }
  const contentType = detectContentTypeFromUrl(parsed.href);
  if (!contentType) {
    throw new CastGuardError("Не удалось определить тип видео", "not_video");
  }
  return contentType;
}
