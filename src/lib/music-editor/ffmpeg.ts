import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { audioBufferToWav } from "./waveform";
import type { ExportFormat } from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const FFMPEG_BASE = "/ffmpeg";

export type ExportStage =
  | "prepare"
  | "create-wav"
  | "load-ffmpeg"
  | "encode"
  | "create-blob"
  | "download";

export interface ExportProgress {
  stage: ExportStage;
  percent: number;
  message: string;
}

/** Извлекает читаемый текст ошибки для UI и console. */
export function formatExportError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [err.message];
    if (err.cause) parts.push(`Причина: ${formatExportError(err.cause)}`);
    if (err.stack) console.error("[Music Editor export]", err.stack);
    return parts.join(" — ");
  }
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function logExport(stage: ExportStage, message: string, extra?: unknown) {
  console.info(`[Music Editor export] ${stage}: ${message}`, extra ?? "");
}

function getExtension(file: File): string {
  const match = file.name.match(/\.([^.]+)$/i);
  const ext = match ? match[1].toLowerCase() : "";
  const valid = ["mp3", "wav", "m4a", "aac", "mp4", "wave"];
  return valid.includes(ext) ? ext : "mp3";
}

async function verifyFfmpegAssets(): Promise<void> {
  const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];
  for (const file of files) {
    const url = `${FFMPEG_BASE}/${file}`;
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) {
      throw new Error(
        `Файл ${url} недоступен (HTTP ${res.status}). Запустите npm install для копирования FFmpeg в public/ffmpeg.`,
      );
    }
    logExport("load-ffmpeg", `OK ${url} (${res.headers.get("content-length") ?? "?"} bytes)`);
  }
}

async function loadFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  logExport("load-ffmpeg", "Проверка файлов в public/ffmpeg…");
  await verifyFfmpegAssets();

  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    console.debug("[ffmpeg]", message);
  });
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });
  }

  const base = `${window.location.origin}${FFMPEG_BASE}`;
  logExport("load-ffmpeg", `Загрузка core из ${base} (UMD, локально)…`);

  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
  } catch (err) {
    throw new Error(`FFmpeg load() failed: ${formatExportError(err)}`);
  }

  if (!ffmpeg.loaded) {
    throw new Error("FFmpeg сообщил об успехе, но loaded=false");
  }

  logExport("load-ffmpeg", "FFmpeg готов");
  return ffmpeg;
}

export async function getFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = loadFFmpeg(onProgress)
      .then((ffmpeg) => {
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      })
      .catch((err) => {
        loadPromise = null;
        const detail = formatExportError(err);
        console.error("[Music Editor export] FFmpeg init failed:", detail);
        throw new Error(`Не удалось загрузить кодировщик MP3: ${detail}`);
      });
  }

  return loadPromise;
}

export async function decodeFileToWav(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  const ffmpeg = await getFFmpeg(onProgress);
  const inputName = `input_${Date.now()}.${getExtension(file)}`;
  const outputName = `output_${Date.now()}.wav`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec(["-i", inputName, "-ar", "44100", "-ac", "2", outputName]);
  const data = await ffmpeg.readFile(outputName);

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }
  return new TextEncoder().encode(data as string).buffer;
}

async function encodeMp3WithFfmpeg(
  wavData: ArrayBuffer,
  format: "mp3-320" | "mp3-192",
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);
  const inputName = `encode_in_${Date.now()}.wav`;
  const outputName = `encode_out_${Date.now()}.mp3`;
  const bitrate = format === "mp3-320" ? "320k" : "192k";

  logExport("encode", `FFmpeg: кодирование MP3 ${bitrate}…`);
  await ffmpeg.writeFile(inputName, new Uint8Array(wavData));
  await ffmpeg.exec(["-i", inputName, "-c:a", "libmp3lame", "-b:a", bitrate, outputName]);
  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy], { type: "audio/mpeg" });
  }
  return new Blob([new TextEncoder().encode(data as string)], { type: "audio/mpeg" });
}

/**
 * Экспорт уже обработанного AudioBuffer (эффекты применены в Web Audio).
 * WAV — напрямую из Web Audio, без FFmpeg.
 * MP3 — через FFmpeg (libmp3lame).
 */
export async function exportAudioBuffer(
  buffer: AudioBuffer,
  format: ExportFormat,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "prepare", percent: 5, message: "Подготовка аудио…" });
  logExport("prepare", `Формат: ${format}, длительность: ${buffer.duration.toFixed(2)}s`);

  onProgress?.({ stage: "create-wav", percent: 15, message: "Создание WAV…" });
  const wavData = audioBufferToWav(buffer);
  logExport("create-wav", `WAV ${(wavData.byteLength / 1024).toFixed(0)} KB`);

  if (format === "wav") {
    onProgress?.({ stage: "create-blob", percent: 85, message: "Формирование WAV…" });
    const blob = new Blob([wavData], { type: "audio/wav" });
    logExport("create-blob", `Blob ${(blob.size / 1024).toFixed(0)} KB (Web Audio, без FFmpeg)`);
    onProgress?.({ stage: "download", percent: 100, message: "Готово" });
    return blob;
  }

  onProgress?.({ stage: "load-ffmpeg", percent: 35, message: "Загрузка кодировщика MP3…" });

  const blob = await encodeMp3WithFfmpeg(wavData, format, (pct) => {
    onProgress?.({
      stage: "encode",
      percent: 40 + pct * 0.5,
      message: `Кодирование MP3 (${format === "mp3-320" ? "320" : "192"} kbps)… ${pct}%`,
    });
  });

  onProgress?.({ stage: "create-blob", percent: 95, message: "Формирование MP3…" });
  logExport("create-blob", `Blob ${(blob.size / 1024).toFixed(0)} KB`);
  onProgress?.({ stage: "download", percent: 100, message: "Готово" });
  return blob;
}

/** @deprecated Используйте exportAudioBuffer */
export async function encodeBufferToFile(
  wavData: ArrayBuffer,
  format: ExportFormat,
  _filename: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (format === "wav") {
    onProgress?.(90);
    return new Blob([wavData], { type: "audio/wav" });
  }
  return encodeMp3WithFfmpeg(wavData, format, onProgress);
}

export function downloadBlob(blob: Blob, filename: string) {
  logExport("download", `Скачивание ${filename} (${(blob.size / 1024).toFixed(0)} KB)`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
