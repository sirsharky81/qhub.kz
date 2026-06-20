import { MAX_STREAM_BYTES } from "./constants";
import type { VideoMetadata } from "./types";
import { ExtractClientError } from "./extract-errors";

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    /* ignore */
  }
  return "Не удалось выполнить запрос";
}

/** Legacy server-side extraction via Vercel API + yt-dlp. */
export async function fetchMetadataServer(url: string): Promise<VideoMetadata> {
  const res = await fetch("/api/audio-extractor/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new ExtractClientError(await parseErrorResponse(res), res.status);
  }

  return (await res.json()) as VideoMetadata;
}

/** Legacy server-side audio stream via Vercel API + yt-dlp. */
export async function fetchAudioStreamServer(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  const res = await fetch("/api/audio-extractor/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new ExtractClientError(await parseErrorResponse(res), res.status);
  }

  const contentLength = res.headers.get("Content-Length");
  const total = contentLength ? Number(contentLength) : null;
  const reader = res.body?.getReader();
  if (!reader) throw new ExtractClientError("Пустой ответ сервера");

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

  const mimeType = res.headers.get("Content-Type") ?? "audio/mp4";
  return new Blob(chunks as BlobPart[], { type: mimeType });
}
