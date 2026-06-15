import type { A4FitMode } from "./types";
import { A4_HEIGHT_PX, A4_WIDTH_PX } from "./constants";

export const A4_MARGIN_FRAC = 0.05;

export function getAvailArea(pageW: number, pageH: number) {
  const margin = pageW * A4_MARGIN_FRAC;
  return {
    margin,
    availW: pageW - margin * 2,
    availH: pageH - margin * 2,
  };
}

/** Width of item as fraction of available area width (0–1). */
export function computeFitWidthFrac(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
  fitMode: A4FitMode,
): number {
  const aspect = imgW / imgH;
  const availAspect = availW / availH;

  let drawW: number;
  let drawH: number;

  if (fitMode === "natural") {
    // 1:1 pixel mapping at export resolution (300 DPI A4), then clamp to printable area
    drawW = imgW;
    drawH = imgH;
    if (drawW > availW) {
      drawH = (drawH * availW) / drawW;
      drawW = availW;
    }
    if (drawH > availH) {
      drawW = (drawW * availH) / drawH;
      drawH = availH;
    }
  } else if (aspect > availAspect) {
    drawW = availW;
    drawH = drawW / aspect;
  } else {
    drawH = availH;
    drawW = drawH * aspect;
  }

  return Math.min(1, drawW / availW);
}

export function computeDrawSize(
  imgW: number,
  imgH: number,
  widthFrac: number,
  availW: number,
  availH: number,
): { drawW: number; drawH: number } {
  const aspect = imgW / imgH;
  let drawW = availW * widthFrac;
  let drawH = drawW / aspect;

  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * aspect;
  }

  return { drawW, drawH };
}

export function defaultComposeWidthFrac(index: number): number {
  const { availW } = getAvailArea(A4_WIDTH_PX, A4_HEIGHT_PX);
  const baseW = availW * 0.42;
  return Math.min(0.55, baseW / availW);
}

export function defaultComposePosition(index: number): { x: number; y: number } {
  const slots = [0.32, 0.68];
  return { x: slots[index % slots.length] ?? 0.5, y: 0.5 };
}

/** Migrate legacy `scale` field to widthFrac */
export function resolveWidthFrac(item: {
  widthFrac?: number;
  scale?: number;
}): number {
  if (item.widthFrac != null) return item.widthFrac;
  if (item.scale != null) {
    // Old compose scale used 0.4 * scale of canvas width
    if (item.scale <= 0.55) return item.scale * 0.42;
    return item.scale;
  }
  return 1;
}

export function getItemBounds(
  item: { x: number; y: number; widthFrac?: number; scale?: number; rotation?: number },
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
) {
  const { margin, availW, availH } = getAvailArea(pageW, pageH);
  const widthFrac = resolveWidthFrac(item);
  const { drawW, drawH } = computeDrawSize(imgW, imgH, widthFrac, availW, availH);
  const cx = margin + item.x * availW;
  const cy = margin + item.y * availH;
  return { cx, cy, drawW, drawH, margin, availW, availH, widthFrac };
}

const MIN_WIDTH_FRAC = 0.05;
const MAX_WIDTH_FRAC = 1;

/** Proportional resize from pointer — keeps aspect ratio. */
export function widthFracFromPointer(
  cx: number,
  cy: number,
  pointerX: number,
  pointerY: number,
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): number {
  const aspect = imgW / imgH;
  const dx = Math.abs(pointerX - cx);
  const dy = Math.abs(pointerY - cy);

  let halfW = dx;
  let halfH = halfW / aspect;
  if (halfH < dy) {
    halfH = dy;
    halfW = halfH * aspect;
  }

  let drawW = halfW * 2;
  let drawH = halfH * 2;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * aspect;
  }
  if (drawW > availW) {
    drawW = availW;
  }

  return Math.min(MAX_WIDTH_FRAC, Math.max(MIN_WIDTH_FRAC, drawW / availW));
}

export function rotatedCorners(
  cx: number,
  cy: number,
  drawW: number,
  drawH: number,
  rotationDeg: number,
): { x: number; y: number }[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local = [
    { x: -drawW / 2, y: -drawH / 2 },
    { x: drawW / 2, y: -drawH / 2 },
    { x: drawW / 2, y: drawH / 2 },
    { x: -drawW / 2, y: drawH / 2 },
  ];
  return local.map(({ x, y }) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }));
}

export function pointerToLocal(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rotationDeg: number,
): { x: number; y: number } {
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

export const REFERENCE_PAGE = { w: A4_WIDTH_PX, h: A4_HEIGHT_PX };
