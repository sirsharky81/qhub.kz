import type { NormPoint, Point } from "./types";
import { CROP_OUTPUT_MAX_PX } from "./constants";

const WORKING_MAX_PX = 4096;
const DETECT_MAX_PX = 960;

export function downscaleCanvas(
  canvas: HTMLCanvasElement,
  maxDim: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;

  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

export async function fileToCanvas(
  file: File,
  maxDimension = WORKING_MAX_PX,
): Promise<HTMLCanvasElement> {
  let blob: Blob = file;
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "heic" || ext === "heif") {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    blob = Array.isArray(converted) ? converted[0]! : converted;
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return downscaleCanvas(canvas, maxDimension);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ContentRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Bounding box of non-white scan content (ignores empty margins in cropped JPEG). */
export function detectContentRect(
  canvas: HTMLCanvasElement,
  whiteThreshold = 238,
): ContentRect {
  const maxSample = 480;
  const downscale = Math.min(1, maxSample / Math.max(canvas.width, canvas.height));

  let sample = canvas;
  let invScale = 1;
  if (downscale < 1) {
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(canvas.width * downscale));
    tmp.height = Math.max(1, Math.round(canvas.height * downscale));
    tmp.getContext("2d")!.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    sample = tmp;
    invScale = 1 / downscale;
  }

  const ctx = sample.getContext("2d")!;
  const { width, height } = sample;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < whiteThreshold || chroma > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) {
    return { sx: 0, sy: 0, sw: canvas.width, sh: canvas.height };
  }

  const pad = Math.max(2, Math.round(0.015 * Math.max(maxX - minX, maxY - minY)));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  return {
    sx: Math.round(minX * invScale),
    sy: Math.round(minY * invScale),
    sw: Math.round((maxX - minX + 1) * invScale),
    sh: Math.round((maxY - minY + 1) * invScale),
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

export function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  return loadImage(url).then((img) => {
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), mime, quality);
  });
}

export function rotateCanvas(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return canvas;

  const rad = (normalized * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = canvas.width;
  const h = canvas.height;
  const outW = Math.round(w * cos + h * sin);
  const outH = Math.round(w * sin + h * cos);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -w / 2, -h / 2);
  return out;
}

export function normToPixel(p: NormPoint, w: number, h: number): Point {
  return { x: p.x * w, y: p.y * h };
}

export function pixelToNorm(p: Point, w: number, h: number): NormPoint {
  return { x: p.x / w, y: p.y / h };
}

import { defaultA4CropCorners } from "./crop-utils";

export function defaultCorners(): NormPoint[] {
  return defaultA4CropCorners();
}

/** Downscaled copy for edge detection only */
export function canvasForDetection(canvas: HTMLCanvasElement): HTMLCanvasElement {
  return downscaleCanvas(canvas, DETECT_MAX_PX);
}

/** Perspective warp: map quad in source to rectangle */
export async function warpPerspective(
  source: HTMLCanvasElement,
  corners: NormPoint[],
  outWidth: number,
  outHeight: number,
): Promise<HTMLCanvasElement> {
  const { perfAsync, perfMark, perfMeasure } = await import("./scanner-perf");
  const { warpPerspectiveOpenCV } = await import("./opencv-warp");
  const { warpPerspectiveFast } = await import("./warp-perspective-fast");

  return perfAsync("warp-total", async () => {
    perfMark("warp-total:start");
    const cvOut = await warpPerspectiveOpenCV(source, corners, outWidth, outHeight);
    if (cvOut) {
      perfMeasure("warp-total", "warp-total:start");
      return cvOut;
    }

    perfMark("warp-canvas:start");
    const out = warpPerspectiveFast(source, corners, outWidth, outHeight);
    perfMeasure("warp-canvas", "warp-canvas:start");
    perfMeasure("warp-total", "warp-total:start");
    return out;
  });
}

export function orderCorners(corners: NormPoint[]): NormPoint[] {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;

  return [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

export function estimateOutputSize(corners: NormPoint[], srcW: number, srcH: number): { w: number; h: number } {
  const pts = corners.map((c) => normToPixel(c, srcW, srcH));
  const w1 = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
  const w2 = Math.hypot(pts[2]!.x - pts[3]!.x, pts[2]!.y - pts[3]!.y);
  const h1 = Math.hypot(pts[3]!.x - pts[0]!.x, pts[3]!.y - pts[0]!.y);
  const h2 = Math.hypot(pts[2]!.x - pts[1]!.x, pts[2]!.y - pts[1]!.y);
  const w = Math.max(w1, w2);
  const h = Math.max(h1, h2);
  const maxDim = CROP_OUTPUT_MAX_PX;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}
