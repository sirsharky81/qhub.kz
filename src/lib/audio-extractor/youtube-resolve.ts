import { MAX_DURATION_SEC } from "./constants";
import type { VideoMetadata } from "./types";
import { invidiousApiBases, pipedApiBases } from "./youtube-instances";

export interface YoutubeResolved {
  metadata: VideoMetadata;
  audioUrl: string;
  mimeType: string;
}

export class YoutubeResolveError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "unavailable" | "too_long" | "blocked" = "blocked",
  ) {
    super(message);
    this.name = "YoutubeResolveError";
  }
}

function pipedHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    Referer: "https://piped.video/",
    Origin: "https://piped.video",
  };
}

async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const type = res.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) {
    const text = (await res.text()).trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function tryPiped(videoId: string): Promise<YoutubeResolved | null> {
  for (const base of pipedApiBases()) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        headers: pipedHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;

      const data = await readJsonResponse<{
        title?: string;
        uploader?: string;
        duration?: number;
        thumbnail?: string;
        thumbnailUrl?: string;
        proxyUrl?: string;
        audioStreams?: { url?: string; bitrate?: number; mimeType?: string }[];
      }>(res);

      if (!data) continue;

      const streams = data.audioStreams?.filter((s) => s.url) ?? [];
      if (streams.length === 0) continue;

      const best = streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      const duration = data.duration ?? 0;
      if (duration <= 0) continue;
      if (duration > MAX_DURATION_SEC) {
        throw new YoutubeResolveError(
          `Видео длиннее ${Math.floor(MAX_DURATION_SEC / 60)} минут`,
          "too_long",
        );
      }

      const audioUrl = best.url!;
      const mimeType = best.mimeType ?? "audio/mp4";

      return {
        metadata: {
          title: data.title?.trim() || "audio",
          duration,
          thumbnail: data.thumbnail ?? data.thumbnailUrl ?? null,
          platform: "youtube",
          uploader: data.uploader ?? null,
          id: videoId,
        },
        audioUrl,
        mimeType,
      };
    } catch (err) {
      if (err instanceof YoutubeResolveError) throw err;
    }
  }
  return null;
}

async function tryInvidious(videoId: string): Promise<YoutubeResolved | null> {
  for (const base of invidiousApiBases()) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;

      const data = await readJsonResponse<{
        title?: string;
        author?: string;
        lengthSeconds?: number;
        videoThumbnails?: { url?: string; quality?: string }[];
        adaptiveFormats?: {
          url?: string;
          type?: string;
          bitrate?: string;
          encoding?: string;
        }[];
      }>(res);

      if (!data) continue;

      const audioFormats =
        data.adaptiveFormats?.filter(
          (f) =>
            f.url &&
            (f.type?.startsWith("audio/") || f.encoding === "opus" || f.encoding === "aac"),
        ) ?? [];

      if (audioFormats.length === 0) continue;

      const best = audioFormats.sort(
        (a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0),
      )[0];

      const duration = Number(data.lengthSeconds ?? 0);
      if (duration <= 0) continue;
      if (duration > MAX_DURATION_SEC) {
        throw new YoutubeResolveError(
          `Видео длиннее ${Math.floor(MAX_DURATION_SEC / 60)} минут`,
          "too_long",
        );
      }

      const thumb =
        data.videoThumbnails?.find((t) => t.quality === "medium")?.url ??
        data.videoThumbnails?.[0]?.url ??
        null;

      return {
        metadata: {
          title: data.title?.trim() || "audio",
          duration,
          thumbnail: thumb,
          platform: "youtube",
          uploader: data.author ?? null,
          id: videoId,
        },
        audioUrl: best.url!,
        mimeType: best.type?.split(";")[0] ?? "audio/mp4",
      };
    } catch (err) {
      if (err instanceof YoutubeResolveError) throw err;
    }
  }
  return null;
}

export async function resolveYoutubeVideo(videoId: string): Promise<YoutubeResolved> {
  const piped = await tryPiped(videoId);
  if (piped) return piped;

  const invidious = await tryInvidious(videoId);
  if (invidious) return invidious;

  throw new YoutubeResolveError(
    "YouTube недоступен. Попробуйте другую ссылку (без плейлиста) или позже.",
    "blocked",
  );
}
