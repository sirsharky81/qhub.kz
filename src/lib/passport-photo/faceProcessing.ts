import exifr from "exifr";
import { getFormatRule, type PhotoFormatId } from "./format-rules";
import { getHeadBounds, type Landmarks68 } from "./landmarkAdapter";

export interface Point {
  x: number;
  y: number;
}

export interface NormalizedImage {
  canvas: HTMLCanvasElement;
  url: string;
  width: number;
  height: number;
  orientation: number;
}

export interface Adjust {
  zoom: number;
  cxN: number;
  cyN: number;
}

export interface Geom {
  fw: number;
  fh: number;
  nw: number;
  nh: number;
  /** object-fit: cover — минимальный масштаб заполнения кадра */
  cover: number;
  /** object-fit: contain — масштаб, при котором видно всё фото */
  fit: number;
  /** Нижняя граница pinch/slider: чуть ниже contain, чтобы можно было отдалить от autoZoom */
  minZoom: number;
}

export const MAX_ZOOM = 4;

/** zoom=1 → cover; zoom=fit/cover → contain; zoom=minZoom → чуть шире contain */
export function buildGeom(fw: number, fh: number, nw: number, nh: number): Geom {
  const cover = Math.max(fw / nw, fh / nh);
  const fit = Math.min(fw / nw, fh / nh);
  const fitZoom = fit / cover;
  return { fw, fh, nw, nh, cover, fit, minZoom: fitZoom * 0.88 };
}

export interface FaceEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  topMarginY: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const MAX_DIMENSION = 2048;

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

function canvasHasContent(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const x = Math.floor(canvas.width / 2);
  const y = Math.floor(canvas.height / 2);
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return a > 0 && r + g + b > 15;
}

/** Рисует источник на canvas с даунскейлом для iOS memory limits */
function drawSourceToCanvas(source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
  const maxDim = Math.max(srcW, srcH);
  const scale = maxDim > MAX_DIMENSION ? MAX_DIMENSION / maxDim : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function orientationSwapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

function orientedSizeMatches(
  resultW: number,
  resultH: number,
  rawW: number,
  rawH: number,
  orientation: number
): boolean {
  if (orientationSwapsDimensions(orientation)) {
    return resultW === rawH && resultH === rawW;
  }
  return resultW === rawW && resultH === rawH;
}

async function readRawDimensions(file: File): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  const dims = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return dims;
}

/**
 * Читает EXIF и нормализует ориентацию.
 * iOS Safari: Image() уже oriented — ручной поворот даёт пустой/чёрный canvas.
 */
export async function normalizeImageOrientation(file: File): Promise<NormalizedImage> {
  const orientation =
    (await exifr.parse(file, { pick: ["Orientation"] }).catch(() => null))?.Orientation ?? 1;
  const rawDims = await readRawDimensions(file);

  const attempts: Array<() => Promise<HTMLCanvasElement>> = [
    // 1) Современный API — EXIF применяется автоматически
    async () => {
      if (typeof createImageBitmap !== "function") throw new Error("skip");
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      if (
        rawDims &&
        orientation !== 1 &&
        !orientedSizeMatches(bitmap.width, bitmap.height, rawDims.w, rawDims.h, orientation)
      ) {
        bitmap.close();
        throw new Error("from-image dimensions mismatch");
      }
      const canvas = drawSourceToCanvas(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      return canvas;
    },
    // 2) Apple: Image() с нативной ориентацией, без ручного поворота
    async () => {
      if (!isAppleDevice()) throw new Error("skip");
      const img = await loadViaImageElement(file);
      return drawSourceToCanvas(img, img.naturalWidth, img.naturalHeight);
    },
    // 3) Ручной EXIF для Android/desktop
    async () => {
      const bitmap = await createImageBitmap(file);
      const { width, height } = orientedDimensions(bitmap.width, bitmap.height, orientation);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      applyOrientationTransform(ctx, bitmap.width, bitmap.height, orientation);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return drawSourceToCanvas(canvas, width, height);
    },
    // 4) Последний шанс — Image() без EXIF
    async () => {
      const img = await loadViaImageElement(file);
      return drawSourceToCanvas(img, img.naturalWidth, img.naturalHeight);
    },
  ];

  let canvas: HTMLCanvasElement | null = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (canvasHasContent(result)) {
        canvas = result;
        break;
      }
    } catch {
      // пробуем следующий способ
    }
  }

  if (!canvas) {
    throw new Error("Could not decode image");
  }

  return {
    canvas,
    url: canvas.toDataURL("image/jpeg", 0.92),
    width: canvas.width,
    height: canvas.height,
    orientation,
  };
}

/** Вписывает всё фото в кадр (пока geom/view не готовы) */
export function drawFitPreview(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  fw: number,
  fh: number
): void {
  const src = source as HTMLCanvasElement;
  const nw = src.width ?? (source as HTMLImageElement).naturalWidth;
  const nh = src.height ?? (source as HTMLImageElement).naturalHeight;
  if (!nw || !nh) return;

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  target.width = Math.round(fw * dpr);
  target.height = Math.round(fh * dpr);
  target.style.width = `${fw}px`;
  target.style.height = `${fh}px`;

  const ctx = target.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, fw, fh);

  const scale = Math.min(fw / nw, fh / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const dx = (fw - dw) / 2;
  const dy = (fh - dh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, nw, nh, dx, dy, dw, dh);
}

/** Рисует видимую область кадрирования на canvas (без CSS transform — надёжно на iOS) */
export function drawCropPreview(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  geom: Geom,
  view: { scale: number; tx: number; ty: number }
): void {
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  target.width = Math.round(geom.fw * dpr);
  target.height = Math.round(geom.fh * dpr);
  target.style.width = `${geom.fw}px`;
  target.style.height = `${geom.fh}px`;

  const ctx = target.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, geom.fw, geom.fh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const { scale, tx, ty } = view;
  const iw = geom.nw * scale;
  const ih = geom.nh * scale;
  ctx.drawImage(source, 0, 0, geom.nw, geom.nh, tx, ty, iw, ih);
}

/** Экспорт кадра в blob из исходного canvas */
export function cropToBlob(
  source: CanvasImageSource,
  geom: Geom,
  view: { scale: number; tx: number; ty: number },
  outW: number,
  outH: number
): Promise<Blob | null> {
  const { scale, tx, ty } = view;
  const sx = -tx / scale;
  const sy = -ty / scale;
  const sw = geom.fw / scale;
  const sh = geom.fh / scale;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.97);
  });
}

function orientedDimensions(w: number, h: number, orientation: number): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) return { width: h, height: w };
  return { width: w, height: h };
}

function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  srcW: number,
  srcH: number,
  orientation: number
) {
  switch (orientation) {
    case 2:
      ctx.translate(srcW, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(srcW, srcH);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, srcH);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      ctx.translate(0, -srcH);
      break;
    case 6:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -srcH);
      break;
    case 7:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(srcW, -srcH);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-srcW, 0);
      break;
    default:
      break;
  }
}

/**
 * Автокадрирование по landmarks: голова занимает headHeightMin–headHeightMax кадра.
 */
export function computeAutoAdjustFromLandmarks(
  imgW: number,
  imgH: number,
  geom: Geom,
  landmarks: Landmarks68,
  formatId: string
): Adjust {
  const { fw, fh, cover, minZoom } = geom;
  const rules = getFormatRule(formatId);
  const head = getHeadBounds(landmarks);
  const targetHeadRatio = (rules.headHeightMin + rules.headHeightMax) / 2;

  let zoom = (targetHeadRatio * fh) / (head.height * cover);
  zoom = clamp(zoom, minZoom, MAX_ZOOM);
  let scale = cover * zoom;

  const chinTargetY = fh * 0.79;
  let ty = chinTargetY - head.bottom * scale;
  let tx = fw / 2 - head.centerX * scale;

  let crownFrameY = head.top * scale + ty;
  while (crownFrameY < fh * 0.04 && zoom > minZoom) {
    zoom = Math.max(minZoom, zoom * 0.96);
    scale = cover * zoom;
    ty = chinTargetY - head.bottom * scale;
    crownFrameY = head.top * scale + ty;
  }

  return {
    zoom,
    cxN: (fw / 2 - tx) / (imgW * scale),
    cyN: (fh / 2 - ty) / (imgH * scale),
  };
}

/** Эвристика при отсутствии лица */
export function computeHeuristicAdjust(geom: Geom): Adjust {
  const { minZoom } = geom;
  const portrait = geom.nh > geom.nw * 1.05;
  const cxN = 0.5;
  const cyN = portrait ? 0.42 : 0.45;
  const zoom = portrait ? 1.15 : 1.05;
  return { zoom: clamp(zoom, minZoom, MAX_ZOOM), cxN, cyN };
}

export function toView(g: Geom, a: Adjust): { scale: number; tx: number; ty: number } {
  const scale = g.cover * a.zoom;
  const iw = g.nw * scale;
  const ih = g.nh * scale;
  const tx = clamp(g.fw / 2 - a.cxN * g.nw * scale, g.fw - iw, 0);
  const ty = clamp(g.fh / 2 - a.cyN * g.nh * scale, g.fh - ih, 0);
  return { scale, tx, ty };
}

export function fromView(
  g: Geom,
  v: { scale: number; tx: number; ty: number }
): Adjust {
  return {
    zoom: v.scale / g.cover,
    cxN: (g.fw / 2 - v.tx) / (g.nw * v.scale),
    cyN: (g.fh / 2 - v.ty) / (g.nh * v.scale),
  };
}

/** Перевод landmarks в координаты кадра для динамического овала */
export function landmarksToFrameEllipse(
  landmarks: Landmarks68,
  view: { scale: number; tx: number; ty: number },
  imgW: number,
  imgH: number
): FaceEllipse {
  const head = getHeadBounds(landmarks);
  const toFrame = (p: Point) => ({
    x: p.x * view.scale + view.tx,
    y: p.y * view.scale + view.ty,
  });

  const top = toFrame({ x: head.centerX, y: head.top });
  const bottom = toFrame({ x: head.centerX, y: head.bottom });
  const left = toFrame({ x: head.left, y: head.centerY });
  const right = toFrame({ x: head.right, y: head.centerY });

  const cy = (top.y + bottom.y) / 2;
  const ry = Math.abs(bottom.y - top.y) / 2;
  const rx = Math.abs(right.x - left.x) / 2;

  const topMarginY = Math.max(4, top.y - ry * 0.12);

  void imgW;
  void imgH;

  return { cx: (left.x + right.x) / 2, cy, rx, ry, topMarginY };
}

export function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}
