import type { A4FitMode } from "./types";
import { A4_HEIGHT_PX, A4_WIDTH_PX } from "./constants";

export const A4_MARGIN_FRAC = 0.05;

const MIN_WIDTH_FRAC = 0.05;
const MAX_WIDTH_FRAC = 1;
/** Snap to full-page fill when pinch/drag reaches this fraction of max (touch-friendly). */
const FILL_SNAP_THRESHOLD = 0.88;

export function getAvailArea(pageW: number, pageH: number) {
  const margin = pageW * A4_MARGIN_FRAC;
  return {
    margin,
    availW: pageW - margin * 2,
    availH: pageH - margin * 2,
  };
}

/** Largest size that fits in the printable area while keeping aspect ratio. */
export function computeMaxFillDrawSize(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): { drawW: number; drawH: number } {
  const aspect = imgW / imgH;
  const availAspect = availW / availH;

  if (aspect > availAspect) {
    return { drawW: availW, drawH: availW / aspect };
  }
  return { drawW: availH * aspect, drawH: availH };
}

/**
 * Convert a target draw size to stored widthFrac (legacy linear encoding).
 * computeDrawSize(widthFrac) reproduces the target size.
 */
export function widthFracForDrawSize(
  drawW: number,
  drawH: number,
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): number {
  const aspect = imgW / imgH;
  let wf = drawW / availW;
  if ((availW * wf) / aspect > availH) {
    wf = (availH * aspect) / availW;
  }
  return Math.min(MAX_WIDTH_FRAC, Math.max(MIN_WIDTH_FRAC, wf));
}

/** Width of item as fraction of available area width (0–1). */
export function computeFitWidthFrac(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
  fitMode: A4FitMode,
): number {
  if (fitMode === "fit") {
    return 1;
  }

  const max = computeMaxFillDrawSize(imgW, imgH, availW, availH);
  let drawW = imgW;
  let drawH = imgH;
  if (drawW > availW) {
    drawH = (drawH * availW) / drawW;
    drawW = availW;
  }
  if (drawH > availH) {
    drawW = (drawW * availH) / drawH;
    drawH = availH;
  }

  const scale = Math.min(1, drawW / max.drawW, drawH / max.drawH);
  if (scale >= FILL_SNAP_THRESHOLD) return 1;

  return widthFracForDrawSize(
    max.drawW * scale,
    max.drawH * scale,
    imgW,
    imgH,
    availW,
    availH,
  );
}

export function computeDrawSize(
  imgW: number,
  imgH: number,
  widthFrac: number,
  availW: number,
  availH: number,
): { drawW: number; drawH: number } {
  const aspect = imgW / imgH;
  const clamped = Math.min(MAX_WIDTH_FRAC, Math.max(MIN_WIDTH_FRAC, widthFrac));
  let drawW = availW * clamped;
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

/** Proportional resize from local pointer coords (center-relative, unrotated). */
export function widthFracFromLocalPointer(
  localX: number,
  localY: number,
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): number {
  const aspect = imgW / imgH;
  let halfW = Math.abs(localX);
  let halfH = Math.abs(localY);

  if (halfW / aspect < halfH) {
    halfW = halfH * aspect;
  } else {
    halfH = halfW / aspect;
  }

  const maxFill = computeMaxFillDrawSize(imgW, imgH, availW, availH);
  const scale = Math.min(1, (halfW * 2) / maxFill.drawW, (halfH * 2) / maxFill.drawH);

  if (scale >= FILL_SNAP_THRESHOLD) {
    return 1;
  }

  const drawW = maxFill.drawW * scale;
  const drawH = maxFill.drawH * scale;
  return widthFracForDrawSize(drawW, drawH, imgW, imgH, availW, availH);
}

/** Proportional resize from page pointer — keeps aspect ratio. */
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
  const dx = pointerX - cx;
  const dy = pointerY - cy;
  const aspect = imgW / imgH;

  let halfW = Math.abs(dx);
  let halfH = Math.abs(dy);
  if (halfW / aspect < halfH) {
    halfW = halfH * aspect;
  } else {
    halfH = halfW / aspect;
  }

  const maxFill = computeMaxFillDrawSize(imgW, imgH, availW, availH);
  const scale = Math.min(1, (halfW * 2) / maxFill.drawW, (halfH * 2) / maxFill.drawH);

  if (scale >= FILL_SNAP_THRESHOLD) {
    return 1;
  }

  const drawW = maxFill.drawW * scale;
  const drawH = maxFill.drawH * scale;
  return widthFracForDrawSize(drawW, drawH, imgW, imgH, availW, availH);
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
