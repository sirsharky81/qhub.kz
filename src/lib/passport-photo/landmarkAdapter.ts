import type { Point } from "./faceProcessing";

/** 68-точечные landmarks face-api.js (плоский массив {x,y}[]) */
export type Landmarks68 = Array<{ x: number; y: number }>;

function average(points: Array<{ x: number; y: number }>): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Центр между глазами */
export function getEyeCenter(landmarks: Landmarks68): Point {
  return average([getLeftEye(landmarks), getRightEye(landmarks)]);
}

export function getLeftEye(landmarks: Landmarks68): Point {
  return average(landmarks.slice(36, 42));
}

export function getRightEye(landmarks: Landmarks68): Point {
  return average(landmarks.slice(42, 48));
}

/** Подбородок */
export function getChinPoint(landmarks: Landmarks68): Point {
  return { x: landmarks[8].x, y: landmarks[8].y };
}

/** Верх головы — оценка через межглазное расстояние, не фиксированный индекс */
export function getForeheadPoint(landmarks: Landmarks68): Point {
  const eyeCenter = getEyeCenter(landmarks);
  const chin = getChinPoint(landmarks);
  const faceHeight = chin.y - eyeCenter.y;
  return { x: eyeCenter.x, y: eyeCenter.y - faceHeight * 0.85 };
}

/** Ширина лица по контуру */
export function getFaceWidth(landmarks: Landmarks68): number {
  return Math.abs(landmarks[16].x - landmarks[0].x);
}

export interface HeadBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * Bounding box головы с padding для плеч и волос.
 * Низ = подбородок + 25% высоты лица, бока ±15% ширины.
 */
export function getHeadBounds(landmarks: Landmarks68): HeadBounds {
  const forehead = getForeheadPoint(landmarks);
  const chin = getChinPoint(landmarks);
  const faceW = getFaceWidth(landmarks);
  const eyeCenter = getEyeCenter(landmarks);

  const faceHeight = chin.y - forehead.y;
  const top = forehead.y;
  const bottom = chin.y + faceHeight * 0.25;
  const hPad = faceW * 0.15;
  const left = eyeCenter.x - faceW / 2 - hPad;
  const right = eyeCenter.x + faceW / 2 + hPad;

  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}
