import type { ProcessProgress } from "../types";
import { ConverterError } from "../errors";

export type ImageOutput = "jpg" | "png" | "webp" | "avif" | "ico";

async function decodeToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  let blob: Blob = file;
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "heic" || ext === "heif") {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      blob = Array.isArray(converted) ? converted[0]! : converted;
    } catch {
      throw new ConverterError("browser-unsupported", "HEIC decode failed");
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new ConverterError("conversion-failed"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({ canvas, blob });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ConverterError("corrupted"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ConverterError("conversion-failed"))),
      mime,
      quality,
    );
  });
}

export async function convertImage(
  file: File,
  format: ImageOutput,
  onProgress?: (p: ProcessProgress) => void,
  options?: { quality?: number; maxWidth?: number },
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "decode", percent: 20, message: "Чтение изображения…" });
  const { canvas } = await decodeToCanvas(file);

  let target = canvas;
  if (options?.maxWidth && canvas.width > options.maxWidth) {
    const ratio = options.maxWidth / canvas.width;
    const w = options.maxWidth;
    const h = Math.round(canvas.height * ratio);
    const resized = document.createElement("canvas");
    resized.width = w;
    resized.height = h;
    resized.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
    target = resized;
  }

  onProgress?.({ stage: "encode", percent: 60, message: "Конвертация…" });

  if (format === "ico") {
    const icoCanvas = document.createElement("canvas");
    icoCanvas.width = 256;
    icoCanvas.height = 256;
    icoCanvas.getContext("2d")!.drawImage(target, 0, 0, 256, 256);
    const pngBlob = await canvasToBlob(icoCanvas, "image/png");
    return {
      blob: pngBlob,
      filename: file.name.replace(/\.[^.]+$/, ".png"),
      mimeType: "image/png",
    };
  }

  const mimeMap: Record<ImageOutput, string> = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/png",
  };

  const mime = mimeMap[format];
  if (format === "avif" && typeof target.toBlob !== "function") {
    throw new ConverterError("browser-unsupported", "AVIF not supported");
  }

  const quality = options?.quality ?? (format === "jpg" || format === "webp" ? 0.85 : undefined);
  const blob = await canvasToBlob(target, mime, quality);
  const ext = format === "jpg" ? "jpg" : format;

  onProgress?.({ stage: "done", percent: 100, message: "Готово" });
  return {
    blob,
    filename: file.name.replace(/\.[^.]+$/, `.${ext}`),
    mimeType: mime,
  };
}

export async function removeExif(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "process", percent: 40, message: "Удаление EXIF…" });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const format: ImageOutput = ext === "png" ? "png" : ext === "webp" ? "webp" : "jpg";
  return convertImage(file, format, onProgress);
}

export async function compressImage(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const format: ImageOutput = ext === "png" ? "png" : "webp";
  return convertImage(file, format, onProgress, { quality: 0.75, maxWidth: 2048 });
}
