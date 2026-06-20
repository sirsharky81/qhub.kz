import { decodeFileToWav } from "@/lib/music-editor/ffmpeg";
import { computePeaks, decodeAudioBuffer } from "@/lib/music-editor/waveform";
import { MAX_DECODED_BYTES } from "./constants";
import type { ExtractedAudio, VideoMetadata } from "./types";

function needsFfmpegDecode(mimeType: string): boolean {
  const type = mimeType.toLowerCase();
  return (
    type.includes("mp4") ||
    type.includes("m4a") ||
    type.includes("aac") ||
    type.includes("webm") ||
    type.includes("octet-stream")
  );
}

function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "application/octet-stream" });
}

export async function loadExtractedAudio(
  blob: Blob,
  metadata: VideoMetadata,
  onProgress?: (pct: number) => void,
): Promise<ExtractedAudio> {
  if (blob.size > MAX_DECODED_BYTES) {
    throw new Error(`Файл слишком большой (макс. ${MAX_DECODED_BYTES / 1024 / 1024} МБ)`);
  }

  onProgress?.(10);
  const file = blobToFile(blob, `${metadata.title}.m4a`);
  let buffer: AudioBuffer | null = null;

  if (!needsFfmpegDecode(blob.type)) {
    try {
      buffer = await decodeAudioBuffer(await blob.arrayBuffer());
    } catch {
      buffer = null;
    }
  }

  if (!buffer) {
    onProgress?.(20);
    const wavData = await decodeFileToWav(file, (pct) => {
      onProgress?.(20 + pct * 0.65);
    });
    onProgress?.(88);
    buffer = await decodeAudioBuffer(wavData);
    onProgress?.(92);
  }

  if (!buffer || buffer.duration <= 0) {
    throw new Error("Не удалось декодировать аудио");
  }

  onProgress?.(95);
  const peaks = computePeaks(buffer);
  onProgress?.(100);

  return { buffer, peaks, blob, mimeType: blob.type || "audio/mp4", metadata };
}
