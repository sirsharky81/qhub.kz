import { MAX_STREAM_BYTES } from "./constants";
import { fetchAudioStreamServer } from "./extract-client-server";
import { ExtractClientError } from "./extract-errors";
import type { VideoMetadata } from "./types";
import { validateMvpExtractorUrl } from "./url-validator";
import { extractYoutubeVideoId } from "./youtube-id";
import {
  resolveYoutubeVideo,
  YoutubeResolveError,
  type YoutubeResolved,
} from "./youtube-resolve";

const resolveCache = new Map<string, YoutubeResolved>();
const serverStreamOnly = new Set<string>();

function mapResolveError(err: YoutubeResolveError): ExtractClientError {
  if (err.code === "too_long") return new ExtractClientError(err.message, 400);
  if (err.code === "unavailable" || err.code === "blocked") {
    return new ExtractClientError(err.message, 404);
  }
  return new ExtractClientError(err.message);
}

async function downloadAudioUrl(
  audioUrl: string,
  mimeType: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  const upstream = await fetch(audioUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  if (!upstream.ok || !upstream.body) {
    throw new ExtractClientError("Не удалось загрузить аудио", 404);
  }

  const contentLength = upstream.headers.get("Content-Length");
  const total = contentLength ? Number(contentLength) : null;
  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      loaded += value.length;
      if (loaded > MAX_STREAM_BYTES) {
        reader.cancel();
        throw new ExtractClientError("Файл слишком большой");
      }
      chunks.push(value);
      onProgress?.(loaded, total);
    }
  }

  return new Blob(chunks as BlobPart[], {
    type: mimeType || upstream.headers.get("Content-Type") || "audio/mp4",
  });
}

async function resolveViaServerApi(url: string): Promise<YoutubeResolved | "stream"> {
  const res = await fetch("/api/audio-extractor/youtube-resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const message = await res
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => null);
    throw new ExtractClientError(message || "Не удалось получить данные YouTube", res.status);
  }

  const data = (await res.json()) as {
    metadata: VideoMetadata;
    audioUrl: string | null;
    mimeType: string | null;
    source: string;
  };

  if (!data.audioUrl) {
    serverStreamOnly.add(data.metadata.id);
    resolveCache.set(data.metadata.id, {
      metadata: data.metadata,
      audioUrl: "",
      mimeType: data.mimeType ?? "audio/mp4",
    });
    return "stream";
  }

  const resolved: YoutubeResolved = {
    metadata: data.metadata,
    audioUrl: data.audioUrl,
    mimeType: data.mimeType ?? "audio/mp4",
  };
  resolveCache.set(data.metadata.id, resolved);
  return resolved;
}

async function resolveFromUrl(url: string): Promise<YoutubeResolved | "stream"> {
  const { url: normalized } = validateMvpExtractorUrl(url);
  const videoId = extractYoutubeVideoId(normalized);
  if (!videoId) throw new ExtractClientError("Некорректная ссылка YouTube", 400);

  const cached = resolveCache.get(videoId);
  if (cached) {
    if (serverStreamOnly.has(videoId)) return "stream";
    return cached;
  }

  let browserErr: unknown;
  try {
    const resolved = await resolveYoutubeVideo(videoId);
    resolveCache.set(videoId, resolved);
    return resolved;
  } catch (err) {
    browserErr = err;
    console.warn("[audio-extractor] browser resolve failed, trying server API:", err);
  }

  try {
    return await resolveViaServerApi(normalized);
  } catch (serverErr) {
    if (serverErr instanceof ExtractClientError) throw serverErr;
    if (browserErr instanceof YoutubeResolveError) throw mapResolveError(browserErr);
    throw new ExtractClientError("Не удалось получить данные YouTube");
  }
}

/** Browser-side YouTube metadata with server fallback. */
export async function fetchYoutubeMetadataClient(url: string): Promise<VideoMetadata> {
  const result = await resolveFromUrl(url);
  if (result === "stream") {
    const videoId = extractYoutubeVideoId(validateMvpExtractorUrl(url).url)!;
    return resolveCache.get(videoId)!.metadata;
  }
  return result.metadata;
}

/** Browser-side YouTube audio with server stream fallback. */
export async function fetchYoutubeAudioClient(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  const { url: normalized } = validateMvpExtractorUrl(url);
  const result = await resolveFromUrl(normalized);

  if (result === "stream") {
    resolveCache.delete(extractYoutubeVideoId(normalized)!);
    serverStreamOnly.delete(extractYoutubeVideoId(normalized)!);
    return fetchAudioStreamServer(normalized, onProgress);
  }

  resolveCache.delete(result.metadata.id);

  try {
    return await downloadAudioUrl(result.audioUrl, result.mimeType, onProgress);
  } catch (directErr) {
    console.warn("[audio-extractor] direct audio fetch failed, using server stream:", directErr);
    return fetchAudioStreamServer(normalized, onProgress);
  }
}
