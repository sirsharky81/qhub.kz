import { MAX_DURATION_SEC } from "./constants";
import type { VideoMetadata } from "./types";
import { YtdlpError } from "./ytdlp";
import { extractYoutubeVideoId } from "./youtube-id";

const PIPED_BASES = [
  "https://pipedapi.syncpundit.io",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.leptons.xyz",
];

const INVIDIOUS_BASES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://vid.puffyan.us",
];

interface ResolvedYoutube {
  metadata: VideoMetadata;
  audioUrl: string;
  mimeType: string;
}

function pipedBases(): string[] {
  const fromEnv = process.env.PIPED_API_BASE?.trim();
  if (fromEnv) return [fromEnv.replace(/\/$/, ""), ...PIPED_BASES];
  return PIPED_BASES;
}

function invidiousBases(): string[] {
  const fromEnv = process.env.INVIDIOUS_API_BASE?.trim();
  if (fromEnv) return [fromEnv.replace(/\/$/, ""), ...INVIDIOUS_BASES];
  return INVIDIOUS_BASES;
}

function pipedHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://piped.video/",
    Origin: "https://piped.video",
  };
}

async function tryPiped(videoId: string): Promise<ResolvedYoutube | null> {
  for (const base of pipedBases()) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        headers: pipedHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.warn("[youtube-fallback] piped", base, res.status);
        continue;
      }

      const data = (await res.json()) as {
        title?: string;
        uploader?: string;
        duration?: number;
        thumbnail?: string;
        audioStreams?: { url?: string; bitrate?: number; mimeType?: string }[];
      };

      const streams = data.audioStreams?.filter((s) => s.url) ?? [];
      if (streams.length === 0) continue;

      const best = streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      const duration = data.duration ?? 0;
      if (duration <= 0 || duration > MAX_DURATION_SEC) continue;

      return {
        metadata: {
          title: data.title?.trim() || "audio",
          duration,
          thumbnail: data.thumbnail ?? null,
          platform: "youtube",
          uploader: data.uploader ?? null,
          id: videoId,
        },
        audioUrl: best.url!,
        mimeType: best.mimeType ?? "audio/mp4",
      };
    } catch (err) {
      console.warn("[youtube-fallback] piped", base, err);
    }
  }
  return null;
}

async function tryInvidious(videoId: string): Promise<ResolvedYoutube | null> {
  for (const base of invidiousBases()) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "QHub-AudioExtractor/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.warn("[youtube-fallback] invidious", base, res.status);
        continue;
      }

      const data = (await res.json()) as {
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
      };

      const audioFormats =
        data.adaptiveFormats?.filter(
          (f) => f.url && (f.type?.startsWith("audio/") || f.encoding === "opus" || f.encoding === "aac"),
        ) ?? [];

      if (audioFormats.length === 0) continue;

      const best = audioFormats.sort(
        (a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0),
      )[0];

      const duration = Number(data.lengthSeconds ?? 0);
      if (duration <= 0 || duration > MAX_DURATION_SEC) continue;

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
      console.warn("[youtube-fallback] invidious", base, err);
    }
  }
  return null;
}

async function resolveYoutube(videoId: string): Promise<ResolvedYoutube> {
  const piped = await tryPiped(videoId);
  if (piped) return piped;

  const invidious = await tryInvidious(videoId);
  if (invidious) return invidious;

  throw new YtdlpError(
    "YouTube недоступен с сервера. Попробуйте позже или другую ссылку (без плейлиста).",
    "blocked",
  );
}

export async function fetchYoutubeMetadataViaFallback(url: string): Promise<VideoMetadata> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  const resolved = await resolveYoutube(videoId);
  return resolved.metadata;
}

export async function fetchYoutubeAudioViaFallback(url: string): Promise<Response> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  const resolved = await resolveYoutube(videoId);

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
