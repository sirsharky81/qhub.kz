import type { NormPoint } from "./types";
import { canvasForDetection, downscaleCanvas } from "./canvas-utils";
import { defaultA4CropCorners } from "./crop-utils";
import { detectInWorker, type DetectResult } from "./detect-in-worker";
import { downscaleCanvasAsync, yieldToMain } from "./async-utils";

const AUTO_DETECT_MAX_PX = 640;
export const AUTO_DETECT_MIN_CONFIDENCE = 0.32;

function canvasToRgba(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}

async function prepareDetectionCanvas(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  await yieldToMain();
  return downscaleCanvasAsync(canvas, AUTO_DETECT_MAX_PX);
}

function pickCorners(result: DetectResult | null | undefined): DetectResult {
  if (result?.corners?.length === 4) {
    if (result.confidence >= AUTO_DETECT_MIN_CONFIDENCE) return result;
    return { corners: defaultA4CropCorners(), confidence: 0 };
  }
  return { corners: defaultA4CropCorners(), confidence: 0 };
}

/** Non-blocking auto-detect — worker, no OpenCV CDN wait */
export async function autoDetectDocumentCorners(
  canvas: HTMLCanvasElement,
  onRefined?: (corners: NormPoint[]) => void,
): Promise<DetectResult> {
  const small = await prepareDetectionCanvas(canvas);
  await yieldToMain();
  const { rgba, width, height } = canvasToRgba(small);
  const result = pickCorners(await detectInWorker(rgba, width, height));

  if (onRefined) {
    void import("./opencv-loader").then(async ({ isOpenCVReady }) => {
      if (!isOpenCVReady()) return;
      try {
        const { detectDocumentCornersOpenCV } = await import("./opencv-edge-detection");
        const refined = await detectDocumentCornersOpenCV(small);
        onRefined(refined);
      } catch {
        /* keep canvas corners */
      }
    });
  }

  return result;
}

export async function detectDocumentCornersFast(canvas: HTMLCanvasElement): Promise<DetectResult> {
  return autoDetectDocumentCorners(canvas);
}

export async function detectDocumentCornersCanvas(canvas: HTMLCanvasElement): Promise<DetectResult> {
  const small = downscaleCanvas(canvasForDetection(canvas), AUTO_DETECT_MAX_PX);
  const { rgba, width, height } = canvasToRgba(small);
  return pickCorners(await detectInWorker(rgba, width, height));
}

export { isOpenCVReady } from "./opencv-loader";
export type { DetectResult };
