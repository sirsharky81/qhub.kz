import type { ProcessProgress } from "../types";
import { ConverterError } from "../errors";

const REQUIRED_SIZE = 1024;

export interface PwaIconSet {
  files: { name: string; blob: Blob }[];
  manifest: object;
}

export async function generatePwaIcons(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<PwaIconSet> {
  onProgress?.({ stage: "validate", percent: 10, message: "Проверка изображения…" });

  const { canvas, width, height } = await loadSourceCanvas(file);
  if (width !== REQUIRED_SIZE || height !== REQUIRED_SIZE) {
    throw new ConverterError(
      "conversion-failed",
      `Expected ${REQUIRED_SIZE}x${REQUIRED_SIZE}, got ${width}x${height}`,
    );
  }

  const sizes = [
    { name: "icon-192.png", size: 192, purpose: "any" },
    { name: "icon-512.png", size: 512, purpose: "any" },
    { name: "apple-touch-icon.png", size: 180, purpose: "any" },
    { name: "maskable-icon.png", size: 512, purpose: "maskable" },
  ] as const;

  const files: { name: string; blob: Blob }[] = [];
  let i = 0;
  for (const item of sizes) {
    i++;
    onProgress?.({
      stage: "generate",
      percent: 10 + (i / (sizes.length + 1)) * 80,
      message: `Создание ${item.name}…`,
    });
    const blob = await renderIcon(canvas, item.size, item.purpose === "maskable");
    files.push({ name: item.name, blob });
  }

  onProgress?.({ stage: "manifest", percent: 95, message: "Создание manifest.json…" });
  const faviconBlob = await renderIco(canvas);
  files.push({ name: "favicon.ico", blob: faviconBlob });

  const manifest = {
    name: "My App",
    short_name: "App",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };

  files.push({
    name: "manifest.json",
    blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
  });

  onProgress?.({ stage: "done", percent: 100, message: "Готово" });
  return { files, manifest };
}

function loadSourceCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve({ canvas, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ConverterError("corrupted"));
    };
    img.src = url;
  });
}

async function renderIcon(
  source: HTMLCanvasElement,
  size: number,
  maskable: boolean,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  if (maskable) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const pad = size * 0.1;
    ctx.drawImage(source, pad, pad, size - pad * 2, size - pad * 2);
  } else {
    ctx.drawImage(source, 0, 0, size, size);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ConverterError("conversion-failed"))),
      "image/png",
    );
  });
}

async function renderIco(source: HTMLCanvasElement): Promise<Blob> {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(source, 0, 0, size, size);
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ConverterError("conversion-failed"))),
      "image/png",
    );
  });
  return pngBlob;
}
