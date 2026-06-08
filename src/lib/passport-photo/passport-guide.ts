/**
 * Passport / document photo framing guide.
 *
 * Based on ICAO Doc 9303 biometric requirements:
 *   – head height (crown → chin): 70–80 % of photo height
 *   – margin above the crown (hair must not touch the top edge)
 *   – face centred horizontally
 *   – shoulders visible at the bottom
 *
 * The oval is the primary alignment target (face + head incl. hair).
 * Shoulders are a secondary, wide bottom guide.
 */

export const PASSPORT_GUIDE = {
  /** Minimum empty space at the very top (above hair) */
  topMargin: 0.04,
  /** Crown line — top of head / hair */
  crownY: 0.09,
  /** Chin line */
  chinY: 0.79,
  /** Head width as fraction of frame width */
  headWidth: 0.64,
  /** Shoulder line Y (fraction of frame height from top) */
  shoulderY: 0.86,
  /** Shoulder span as fraction of frame width */
  shoulderWidth: 0.92,
  /** Neck half-width as fraction of frame width */
  neckHalfW: 0.1,
} as const;

/** @deprecated use crownY — kept for compat */
export const headTop = PASSPORT_GUIDE.crownY;

export function headCenterY(): number {
  return (PASSPORT_GUIDE.crownY + PASSPORT_GUIDE.chinY) / 2;
}

export function headHeightRatio(): number {
  return PASSPORT_GUIDE.chinY - PASSPORT_GUIDE.crownY;
}

/** Build SVG path strings for the fixed overlay guide. */
export function buildSilhouettePaths(aspect: number) {
  const W = 100;
  const H = +(W / aspect).toFixed(2);
  const g = PASSPORT_GUIDE;

  const ry = (H * headHeightRatio()) / 2;
  const rx = (W * g.headWidth) / 2;
  const cx = W / 2;
  const cy = H * g.crownY + ry;
  const chinY = H * g.chinY;

  const neckHalfW = W * g.neckHalfW;
  const shoulderY = H * g.shoulderY;
  const shoulderHalfW = (W * g.shoulderWidth) / 2;

  const jawInset = rx * 0.72;
  const jawL = cx - jawInset;
  const jawR = cx + jawInset;

  const leftShoulder = [
    `M ${n(jawL)} ${n(chinY)}`,
    `L ${n(cx - neckHalfW)} ${n(shoulderY - H * 0.01)}`,
    `Q ${n(cx - shoulderHalfW * 0.55)} ${n(shoulderY + H * 0.04)}`,
    `  ${n(cx - shoulderHalfW)} ${n(H * 0.98)}`,
  ].join(" ");

  const rightShoulder = [
    `M ${n(jawR)} ${n(chinY)}`,
    `L ${n(cx + neckHalfW)} ${n(shoulderY - H * 0.01)}`,
    `Q ${n(cx + shoulderHalfW * 0.55)} ${n(shoulderY + H * 0.04)}`,
    `  ${n(cx + shoulderHalfW)} ${n(H * 0.98)}`,
  ].join(" ");

  const eyeY = H * (g.crownY + headHeightRatio() * 0.42);

  // Top margin hint — dashed line showing minimum space above hair
  const marginY = H * g.topMargin;

  return {
    W,
    H,
    head: { cx, cy, rx, ry },
    leftShoulder,
    rightShoulder,
    eyeLine: { y: eyeY, x1: cx - rx * 0.55, x2: cx + rx * 0.55 },
    topMarginLine: marginY,
  };
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeadEstimate {
  centerX: number;
  crownYN: number;
  chinYN: number;
  headHeightN: number;
}

/**
 * Estimate full head bounds from a tight face bounding box.
 * FaceDetector returns roughly eyebrow-to-chin — we expand generously
 * upward for forehead and hair volume (especially important for long/wavy hair).
 */
export function estimateHeadFromFace(face: FaceBox, imgW: number, imgH: number): HeadEstimate {
  const chinY = Math.min(imgH, face.y + face.height * 1.05);
  // Generous upward expansion: ~full face-height above the box top for hair
  const crownY = Math.max(0, face.y - face.height * 1.05);
  const headH = chinY - crownY;
  return {
    centerX: (face.x + face.width / 2) / imgW,
    crownYN: crownY / imgH,
    chinYN: chinY / imgH,
    headHeightN: headH / imgH,
  };
}

/** Scale head to 88 % of the guide zone — leaves room for hair above the oval */
const HEAD_FIT = 0.88;

const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Heuristic face box when FaceDetector is unavailable (Firefox, Safari, etc.).
 * Assumes a typical bust portrait: subject centred, head in the upper area.
 */
export function estimateFaceBoxHeuristic(imgW: number, imgH: number): FaceBox {
  const portrait = imgH > imgW * 1.05;
  const faceH = imgH * (portrait ? 0.24 : 0.32);
  const faceW = faceH * 0.78;
  return {
    x: (imgW - faceW) / 2,
    y: imgH * (portrait ? 0.26 : 0.22),
    width: faceW,
    height: faceH,
  };
}

/**
 * Compute initial pan/zoom:
 *   – scale head (incl. hair estimate) to fit the guide oval
 *   – anchor chin to the guide chin line
 *   – centre face horizontally
 */
export function autoAlignToGuide(
  imgW: number,
  imgH: number,
  face: FaceBox,
  fw: number,
  fh: number,
  cover: number
): { zoom: number; cxN: number; cyN: number } {
  const head = estimateHeadFromFace(face, imgW, imgH);
  const g = PASSPORT_GUIDE;
  const targetHeadH = headHeightRatio();

  // Scale so estimated head fits inside the guide zone (with margin)
  let zoom = (targetHeadH * fh * HEAD_FIT) / (head.headHeightN * imgH * cover);
  zoom = clampN(zoom, 1, 4);
  let scale = cover * zoom;

  // Anchor chin to guide chin line, centre horizontally
  let ty = g.chinY * fh - head.chinYN * imgH * scale;
  const tx = fw / 2 - head.centerX * imgW * scale;

  // Safety: if crown would clip above the guide, zoom out until it fits
  let crownFrameY = head.crownYN * imgH * scale + ty;
  while (crownFrameY < g.crownY * fh && zoom > 1) {
    zoom = Math.max(1, zoom * 0.96);
    scale = cover * zoom;
    ty = g.chinY * fh - head.chinYN * imgH * scale;
    crownFrameY = head.crownYN * imgH * scale + ty;
  }

  const cxN = (fw / 2 - tx) / (imgW * scale);
  const cyN = (fh / 2 - ty) / (imgH * scale);

  return { zoom, cxN, cyN };
}

/** Auto-align using detected face or a portrait heuristic fallback. */
export function computeAutoAdjust(
  imgW: number,
  imgH: number,
  fw: number,
  fh: number,
  cover: number,
  face: FaceBox | null
): { zoom: number; cxN: number; cyN: number } {
  const box = face ?? estimateFaceBoxHeuristic(imgW, imgH);
  return autoAlignToGuide(imgW, imgH, box, fw, fh, cover);
}

function n(v: number) {
  return +v.toFixed(2);
}
