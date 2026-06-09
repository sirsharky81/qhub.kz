import { decodeFileToWav } from "./ffmpeg";
import { computePeaks, decodeAudioBuffer } from "./waveform";
import type { AudioTrack } from "./types";
import { MAX_FILE_SIZE } from "./types";

function generateId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getExtension(file: File): string {
  const match = file.name.match(/\.([^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

/** M4A/AAC need FFmpeg; MP3/WAV can use the browser decoder first. */
function needsFfmpegDecode(file: File): boolean {
  const ext = getExtension(file);
  if (["m4a", "aac", "mp4", "caf"].includes(ext)) return true;
  const type = file.type.toLowerCase();
  if (type.includes("m4a") || type.includes("mp4") || type.includes("aac")) return true;
  return false;
}

async function tryNativeDecode(file: File): Promise<AudioBuffer | null> {
  if (needsFfmpegDecode(file)) return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    return await decodeAudioBuffer(arrayBuffer);
  } catch {
    return null;
  }
}

export async function loadAudioTrack(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<AudioTrack> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (макс. ${MAX_FILE_SIZE / 1024 / 1024} МБ)`);
  }

  onProgress?.(10);
  let buffer = await tryNativeDecode(file);

  if (!buffer) {
    onProgress?.(20);
    const wavData = await decodeFileToWav(file, (pct) => {
      onProgress?.(20 + pct * 0.6);
    });
    onProgress?.(85);
    buffer = await decodeAudioBuffer(wavData);
  }

  if (!buffer || buffer.duration <= 0) {
    throw new Error("Не удалось прочитать аудиофайл. Проверьте формат (MP3, WAV, M4A).");
  }

  onProgress?.(95);
  const peaks = computePeaks(buffer);
  onProgress?.(100);

  return {
    id: generateId(),
    file,
    name: file.name.replace(/\.[^.]+$/, ""),
    duration: buffer.duration,
    size: file.size,
    buffer,
    peaks,
  };
}

export async function loadAudioTracks(
  files: File[],
  onProgress?: (pct: number, fileName: string) => void,
): Promise<AudioTrack[]> {
  const tracks: AudioTrack[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(Math.round((i / files.length) * 100), file.name);
    const track = await loadAudioTrack(file, (pct) => {
      onProgress?.(Math.round(((i + pct / 100) / files.length) * 100), file.name);
    });
    tracks.push(track);
  }

  return tracks;
}
