import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { ProcessProgress } from "./types";
import { ConverterError } from "./errors";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let abortController: AbortController | null = null;

const FFMPEG_BASE = "/ffmpeg";

export function cancelFfmpegOperation(): void {
  abortController?.abort();
  abortController = null;
}

async function loadFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => console.debug("[ffmpeg]", message));
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => onProgress(Math.round(progress * 100)));
  }

  const base = `${window.location.origin}${FFMPEG_BASE}`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });

  if (!ffmpeg.loaded) throw new ConverterError("conversion-failed", "FFmpeg not loaded");
  return ffmpeg;
}

export async function getFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!loadPromise) {
    loadPromise = loadFFmpeg(onProgress)
      .then((ff) => {
        ffmpegInstance = ff;
        return ff;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export async function runFfmpeg(
  file: File,
  args: string[],
  outputName: string,
  onProgress?: (p: ProcessProgress) => void,
): Promise<Uint8Array> {
  abortController = new AbortController();
  onProgress?.({ stage: "load", percent: 5, message: "Загрузка FFmpeg…" });

  const ffmpeg = await getFFmpeg((pct) =>
    onProgress?.({ stage: "load", percent: 5 + pct * 0.15, message: "Загрузка FFmpeg…" }),
  );

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const inputName = `input_${Date.now()}.${ext}`;

  onProgress?.({ stage: "prepare", percent: 25, message: "Подготовка файла…" });
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress?.({ stage: "encode", percent: 35, message: "Обработка…" });
  const fullArgs = ["-i", inputName, ...args, outputName];

  try {
    await ffmpeg.exec(fullArgs);
  } catch (err) {
    if (abortController.signal.aborted) throw new ConverterError("cancelled");
    throw new ConverterError("conversion-failed", String(err));
  }

  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy;
  }
  return new TextEncoder().encode(data as string);
}

export function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function outputFilename(inputName: string, newExt: string): string {
  const base = inputName.replace(/\.[^.]+$/, "");
  return `${base}.${newExt}`;
}

export function uint8ToBlob(data: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy], { type: mimeType });
}
