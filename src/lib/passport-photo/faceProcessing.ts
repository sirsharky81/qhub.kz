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
  cover: number;
}

export interface FaceEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  topMarginY: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Читает EXIF orientation и рисует изображение на canvas с корректным поворотом.
 */
export async function normalizeImageOrientation(file: File): Promise<NormalizedImage> {
  const orientation = (await exifr.parse(file, { pick: ["Orientation"] }).catch(() => null))?.Orientation ?? 1;
  const bitmap = await createImageBitmap(file);
  const { width, height } = orientedDimensions(bitmap.width, bitmap.height, orientation);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  applyOrientationTransform(ctx, bitmap.width, bitmap.height, orientation);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.98);
  });

  return {
    canvas,
    url: URL.createObjectURL(blob),
    width,
    height,
    orientation,
  };
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
  fw: number,
  fh: number,
  cover: number,
  landmarks: Landmarks68,
  formatId: string
): Adjust {
  const rules = getFormatRule(formatId);
  const head = getHeadBounds(landmarks);
  const targetHeadRatio = (rules.headHeightMin + rules.headHeightMax) / 2;

  let zoom = (targetHeadRatio * fh) / (head.height * cover);
  zoom = clamp(zoom, 1, 4);
  let scale = cover * zoom;

  const chinTargetY = fh * 0.79;
  let ty = chinTargetY - head.bottom * scale;
  let tx = fw / 2 - head.centerX * scale;

  let crownFrameY = head.top * scale + ty;
  while (crownFrameY < fh * 0.04 && zoom > 1) {
    zoom = Math.max(1, zoom * 0.96);
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
export function computeHeuristicAdjust(imgW: number, imgH: number, fw: number, fh: number, cover: number): Adjust {
  const portrait = imgH > imgW * 1.05;
  const cxN = 0.5;
  const cyN = portrait ? 0.42 : 0.45;
  const zoom = portrait ? 1.15 : 1.05;
  void fw;
  void fh;
  void cover;
  void imgW;
  void imgH;
  return { zoom: clamp(zoom, 1, 4), cxN, cyN };
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
