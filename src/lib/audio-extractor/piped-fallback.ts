import type { VideoMetadata } from "./types";
import { YtdlpError } from "./ytdlp";
import { extractYoutubeVideoId } from "./youtube-id";
import { resolveYoutubeVideo, YoutubeResolveError } from "./youtube-resolve";

function mapResolveError(err: YoutubeResolveError): YtdlpError {
  if (err.code === "too_long") return new YtdlpError(err.message, "too_long");
  if (err.code === "unavailable") return new YtdlpError(err.message, "unavailable");
  return new YtdlpError(err.message, "blocked");
}

export async function fetchYoutubeMetadataViaFallback(url: string): Promise<VideoMetadata> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  try {
    const resolved = await resolveYoutubeVideo(videoId);
    return resolved.metadata;
  } catch (err) {
    if (err instanceof YoutubeResolveError) throw mapResolveError(err);
    throw new YtdlpError("Не удалось обработать ссылку", "unknown");
  }
}

export async function fetchYoutubeAudioViaFallback(url: string): Promise<Response> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  let resolved;
  try {
    resolved = await resolveYoutubeVideo(videoId);
  } catch (err) {
    if (err instanceof YoutubeResolveError) throw mapResolveError(err);
    throw new YtdlpError("Не удалось обработать ссылку", "unknown");
  }

  const upstream = await fetch(resolved.audioUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  if (!upstream.ok || !upstream.body) {
    throw new YtdlpError("Не удалось загрузить аудио", "unavailable");
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": resolved.mimeType || upstream.headers.get("Content-Type") || "audio/mp4",
      "Cache-Control": "no-store",
    },
  });
}

// Backward-compatible exports
export const fetchYoutubeMetadataViaPiped = fetchYoutubeMetadataViaFallback;
export const fetchYoutubeAudioViaPiped = fetchYoutubeAudioViaFallback;
