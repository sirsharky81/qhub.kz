import { getFormatRule } from "./format-rules";
import {
  getChinPoint,
  getEyeCenter,
  getFaceWidth,
  getForeheadPoint,
  getLeftEye,
  getRightEye,
  type Landmarks68,
} from "./landmarkAdapter";

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export interface QualityResult {
  ok: boolean;
  message?: string;
  laplacianVariance?: number;
  avgBrightness?: number;
}

const REFERENCE_SIZE = 600;
const BASE_BLUR_THRESHOLD = 80;

function toFrameY(y: number, scale: number, ty: number): number {
  return y * scale + ty;
}

function toFrameX(x: number, scale: number, tx: number): number {
  return x * scale + tx;
}

/**
 * Валидация позиции лица в координатах кадра кадрирования.
 */
export function validateFacePosition(
  landmarks: Landmarks68,
  view: { scale: number; tx: number; ty: number },
  fw: number,
  fh: number,
  formatId: string
): ValidationResult {
  const rules = getFormatRule(formatId);
  const forehead = getForeheadPoint(landmarks);
  const chin = getChinPoint(landmarks);
  const eyeCenter = getEyeCenter(landmarks);
  const { scale, tx, ty } = view;

  const faceTop = toFrameY(forehead.y, scale, ty);
  const faceBottom = toFrameY(chin.y, scale, ty);
  const faceHeight = faceBottom - faceTop;
  const faceHeightRatio = faceHeight / fh;

  if (faceHeightRatio < rules.headHeightMin - 0.1) {
    return { ok: false, message: "Приблизьте фото" };
  }
  if (faceHeightRatio > rules.headHeightMax + 0.05) {
    return { ok: false, message: "Отдалите фото" };
  }

  const eyeFrameX = toFrameX(eyeCenter.x, scale, tx);
  const horizontalOffset = Math.abs(eyeFrameX - fw / 2) / fw;
  if (horizontalOffset > 0.15) {
    return { ok: false, message: "Отцентрируйте лицо" };
  }

  const topMargin = faceTop / fh;
  if (topMargin < 0.05) {
    return { ok: false, message: "Сдвиньте фото вниз" };
  }

  const leftEye = getLeftEye(landmarks);
  const rightEye = getRightEye(landmarks);
  const eyeTilt =
    Math.abs(toFrameY(leftEye.y, scale, ty) - toFrameY(rightEye.y, scale, ty)) /
    (getFaceWidth(landmarks) * scale);
  if (eyeTilt > 0.08) {
    return { ok: false, message: "Голова наклонена — загрузите другое фото" };
  }

  return { ok: true };
}

function laplacianVariance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let lap = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          lap += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function averageBrightness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const sampleW = Math.min(120, width);
  const sampleH = Math.min(120, height);
  const sx = Math.floor((width - sampleW) / 2);
  const sy = Math.floor((height - sampleH) / 3);
  const data = ctx.getImageData(sx, sy, sampleW, sampleH).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

function adaptiveBlurThreshold(canvas: HTMLCanvasElement): number {
  const size = Math.min(canvas.width, canvas.height);
  return BASE_BLUR_THRESHOLD * (REFERENCE_SIZE / Math.max(size, 1));
}

/**
 * Валидация качества: резкость и освещённость.
 */
export function validatePhotoQuality(canvas: HTMLCanvasElement): QualityResult {
  const variance = laplacianVariance(canvas);
  const brightness = averageBrightness(canvas);
  const threshold = adaptiveBlurThreshold(canvas);

  if (variance < threshold) {
    return {
      ok: false,
      message: "Фото размыто — загрузите более чёткое",
      laplacianVariance: variance,
      avgBrightness: brightness,
    };
  }
  if (brightness < 60) {
    return {
      ok: false,
      message: "Фото слишком тёмное — загрузите другое",
      laplacianVariance: variance,
      avgBrightness: brightness,
    };
  }
  if (brightness > 220) {
    return {
      ok: false,
      message: "Лицо пересвечено — загрузите другое",
      laplacianVariance: variance,
      avgBrightness: brightness,
    };
  }

  return { ok: true, laplacianVariance: variance, avgBrightness: brightness };
}
