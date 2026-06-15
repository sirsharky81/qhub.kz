import type { NormPoint } from "./types";
import { defaultA4CropCorners } from "./crop-utils";

interface PixelPoint {
  x: number;
  y: number;
}

export interface DetectResult {
  corners: NormPoint[];
  confidence: number;
}

/** Pure detection from RGBA buffer — safe for Web Worker. */
export function detectFromRgba(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): DetectResult {
  const edge = detectFromEdges(rgba, w, h);
  if (edge.confidence >= 0.35) return edge;

  const bright = detectFromBrightness(rgba, w, h);
  if (bright.confidence >= 0.3) return bright;

  return { corners: defaultA4CropCorners(), confidence: 0 };
}

function detectFromEdges(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): DetectResult {
  const gray = toGrayscale(rgba, w, h);
  blur3x3(gray, w, h);
  const edges = sobelEdges(gray, w, h);
  const threshold = otsuThreshold(edges);
  const binary = edges.map((v) => (v > threshold ? 255 : 0));

  const corners = findLargestQuad(binary, w, h);
  if (!corners) return { corners: defaultA4CropCorners(), confidence: 0 };

  const normalized = orderCorners(
    corners.map((p) => ({ x: p.x / w, y: p.y / h })),
  );

  if (!isValidQuad(normalized)) return { corners: defaultA4CropCorners(), confidence: 0 };

  return { corners: normalized, confidence: scoreCorners(normalized) };
}

function detectFromBrightness(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): DetectResult {
  const gray = toGrayscale(rgba, w, h);
  let sum = 0;
  for (const v of gray) sum += v;
  const mean = sum / gray.length;

  let sumSq = 0;
  for (const v of gray) sumSq += (v - mean) ** 2;
  const std = Math.sqrt(sumSq / gray.length);
  const thresh = Math.min(215, mean + std * 0.45);

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 400));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (gray[y * w + x]! >= thresh) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const samples = Math.ceil(w / step) * Math.ceil(h / step);
  if (count < samples * 0.06) return { corners: defaultA4CropCorners(), confidence: 0 };

  const padX = Math.max(2, (maxX - minX) * 0.02);
  const padY = Math.max(2, (maxY - minY) * 0.02);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX);
  maxY = Math.min(h - 1, maxY + padY);

  const normalized = orderCorners([
    { x: minX / w, y: minY / h },
    { x: maxX / w, y: minY / h },
    { x: maxX / w, y: maxY / h },
    { x: minX / w, y: maxY / h },
  ]);

  if (!isValidQuad(normalized)) return { corners: defaultA4CropCorners(), confidence: 0 };

  const area = ((maxX - minX) * (maxY - minY)) / (w * h);
  const confidence = scoreCorners(normalized) * (area > 0.12 && area < 0.92 ? 1 : 0.6);
  return { corners: normalized, confidence };
}

function scoreCorners(corners: NormPoint[]): number {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const area = bw * bh;
  if (area < 0.08) return 0;
  if (area > 0.96) return 0.08;
  return Math.min(1, 0.3 + area * 0.5);
}

function toGrayscale(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    out[i] = Math.round(
      rgba[j]! * 0.299 + rgba[j + 1]! * 0.587 + rgba[j + 2]! * 0.114,
    );
  }
  return out;
}

function blur3x3(gray: Uint8Array, w: number, h: number): void {
  const tmp = new Uint8Array(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * w + (x + dx)]!;
        }
      }
      tmp[y * w + x] = Math.round(sum / 9);
    }
  }
  gray.set(tmp);
}

function sobelEdges(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)]! +
        gray[(y - 1) * w + (x + 1)]! -
        2 * gray[y * w + (x - 1)]! +
        2 * gray[y * w + (x + 1)]! -
        gray[(y + 1) * w + (x - 1)]! +
        gray[(y + 1) * w + (x + 1)]!;
      const gy =
        -gray[(y - 1) * w + (x - 1)]! -
        2 * gray[(y - 1) * w + x]! -
        gray[(y - 1) * w + (x + 1)]! +
        gray[(y + 1) * w + (x - 1)]! +
        2 * gray[(y + 1) * w + x]! +
        gray[(y + 1) * w + (x + 1)]!;
      out[y * w + x] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return out;
}

function otsuThreshold(data: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]!++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) ** 2;
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

function findLargestQuad(binary: Uint8Array, w: number, h: number): PixelPoint[] | null {
  const margin = Math.round(Math.min(w, h) * 0.02);
  const step = Math.max(2, Math.floor(Math.min(w, h) / 200));
  const samples: PixelPoint[] = [];

  for (let y = margin; y < h - margin; y += step) {
    for (let x = margin; x < w - margin; x += step) {
      if (binary[y * w + x]! > 0) samples.push({ x, y });
    }
  }

  if (samples.length < 12) return null;

  let hull = convexHull(samples);
  if (hull.length > 120) {
    const thin = Math.ceil(hull.length / 120);
    hull = hull.filter((_, i) => i % thin === 0);
  }
  if (hull.length < 4) return null;

  return quadFromHull(hull);
}

function quadFromHull(hull: PixelPoint[]): PixelPoint[] {
  if (hull.length === 4) return orderPixelCorners(hull);

  let tl = hull[0]!;
  let tr = hull[0]!;
  let br = hull[0]!;
  let bl = hull[0]!;

  for (const p of hull) {
    const sum = p.x + p.y;
    const diff = p.x - p.y;
    if (sum < tl.x + tl.y) tl = p;
    if (sum > br.x + br.y) br = p;
    if (diff < tr.x - tr.y) tr = p;
    if (diff > bl.x - bl.y) bl = p;
  }

  return orderPixelCorners([tl, tr, br, bl]);
}

function convexHull(points: PixelPoint[]): PixelPoint[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (o: PixelPoint, a: PixelPoint, b: PixelPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: PixelPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: PixelPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function orderPixelCorners(corners: PixelPoint[]): PixelPoint[] {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  return [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

function orderCorners(corners: NormPoint[]): NormPoint[] {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  return [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

function isValidQuad(corners: NormPoint[]): boolean {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  return bw > 0.12 && bh > 0.12 && bw < 0.99 && bh < 0.99;
}
