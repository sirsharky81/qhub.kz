import { MAX_DURATION_SEC } from "./constants";
import type { VideoMetadata } from "./types";
import { YtdlpError } from "./ytdlp";
import { extractYoutubeVideoId } from "./youtube-id";

const DEFAULT_PIPED_BASES = [
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.leptons.xyz",
];

interface PipedStream {
  url?: string;
  bitrate?: number;
  mimeType?: string;
}

interface PipedResponse {
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  audioStreams?: PipedStream[];
}

function pipedBases(): string[] {
  const fromEnv = process.env.PIPED_API_BASE?.trim();
  if (fromEnv) return [fromEnv.replace(/\/$/, ""), ...DEFAULT_PIPED_BASES];
  return DEFAULT_PIPED_BASES;
}

async function fetchPiped(videoId: string): Promise<PipedResponse> {
  let lastError = "Piped API недоступен";

  for (const base of pipedBases()) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        headers: { Accept: "application/json", "User-Agent": "QHub-AudioExtractor/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        lastError = `Piped ${res.status}`;
        continue;
      }
      return (await res.json()) as PipedResponse;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Piped error";
    }
  }

  throw new YtdlpError(lastError, "unknown");
}

function pickBestAudio(data: PipedResponse): PipedStream {
  const streams = data.audioStreams?.filter((s) => s.url) ?? [];
  if (streams.length === 0) {
    throw new YtdlpError("Аудиодорожка не найдена", "unavailable");
  }
  return streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

export async function fetchYoutubeMetadataViaPiped(url: string): Promise<VideoMetadata> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  const data = await fetchPiped(videoId);
  const duration = typeof data.duration === "number" ? data.duration : 0;
  if (duration <= 0) throw new YtdlpError("Не удалось определить длительность", "unknown");
  if (duration > MAX_DURATION_SEC) {
    throw new YtdlpError(
      `Видео длиннее ${Math.floor(MAX_DURATION_SEC / 60)} минут`,
      "too_long",
    );
  }

  return {
    title: data.title?.trim() || "audio",
    duration,
    thumbnail: data.thumbnail ?? null,
    platform: "youtube",
    uploader: data.uploader ?? null,
    id: videoId,
  };
}

export async function fetchYoutubeAudioViaPiped(url: string): Promise<Response> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YtdlpError("Некорректная ссылка YouTube", "unknown");

  const data = await fetchPiped(videoId);
  const audio = pickBestAudio(data);

  const upstream = await fetch(audio.url!, {
    headers: { "User-Agent": "QHub-AudioExtractor/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  if (!upstream.ok || !upstream.body) {
    throw new YtdlpError("Не удалось загрузить аудио", "unavailable");
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": audio.mimeType ?? upstream.headers.get("Content-Type") ?? "audio/mp4",
      "Cache-Control": "no-store",
    },
  });
}
