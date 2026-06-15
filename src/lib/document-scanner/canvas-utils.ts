import type { NormPoint, Point } from "./types";

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
  const maxDim = 2400;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}
