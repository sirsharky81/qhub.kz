import type { NormPoint } from "./types";

/** A4 width / height (portrait). */
export const A4_PAGE_ASPECT = 210 / 297;

/** Centered A4-aspect crop guide — starting point for manual adjustment. */
export function defaultA4CropCorners(inset = 0.06): NormPoint[] {
  const availW = 1 - inset * 2;
  const availH = 1 - inset * 2;

  let w: number;
  let h: number;
  if (availW / availH > A4_PAGE_ASPECT) {
    h = availH * 0.9;
    w = h * A4_PAGE_ASPECT;
  } else {
    w = availW * 0.9;
    h = w / A4_PAGE_ASPECT;
  }

  const cx = 0.5;
  const cy = 0.5;
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
}
