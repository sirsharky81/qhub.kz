import type { NormPoint } from "./types";
import { defaultCorners } from "./canvas-utils";
import { loadOpenCV, type OpenCVInstance } from "./opencv-loader";

type CvMat = ReturnType<OpenCVInstance["imread"]>;

/**
 * OpenCV edge detection — expects a small canvas (~960px) from canvasForDetection().
 */
export async function detectDocumentCornersOpenCV(
  canvas: HTMLCanvasElement,
): Promise<NormPoint[]> {
  const cv = await loadOpenCV();
  const w = canvas.width;
  const h = canvas.height;

  const src = cv.imread(canvas);
  try {
    const gray = new cv.Mat();
    if (src.channels() === 4) {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    } else if (src.channels() === 3) {
      cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
    } else {
      src.copyTo(gray);
    }

    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

    const thresh = new cv.Mat();
    cv.adaptiveThreshold(
      gray,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      11,
      2,
    );

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = w * h;
    let best: NormPoint[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < imageArea * 0.08 || area > imageArea * 0.98) {
        contour.delete();
        continue;
      }

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      if (approx.rows >= 4) {
        const quad = extractQuad(cv, approx);
        if (quad) {
          const quadArea = cv.contourArea(quad);
          if (quadArea > bestArea) {
            bestArea = quadArea;
            best = matToNormPoints(quad, w, h);
          }
          quad.delete();
        }
      }

      approx.delete();
      contour.delete();
    }

    contours.delete();
    hierarchy.delete();
    thresh.delete();
    gray.delete();

    if (best && isValidQuad(best)) {
      return orderDocumentCorners(best);
    }
    return defaultCorners();
  } finally {
    src.delete();
  }
}

function extractQuad(cv: OpenCVInstance, approx: CvMat): CvMat | null {
  if (approx.rows === 4) {
    const copy = new cv.Mat();
    approx.copyTo(copy);
    return copy;
  }

  const hull = new cv.Mat();
  cv.convexHull(approx, hull, false, true);
  const peri = cv.arcLength(hull, true);
  const quad = new cv.Mat();
  cv.approxPolyDP(hull, quad, 0.02 * peri, true);
  hull.delete();

  if (quad.rows !== 4) {
    quad.delete();
    return null;
  }
  return quad;
}

function matToNormPoints(mat: CvMat, w: number, h: number): NormPoint[] {
  const points: NormPoint[] = [];
  for (let i = 0; i < mat.rows; i++) {
    const ptr = mat.intPtr(i, 0);
    points.push({ x: ptr[0]! / w, y: ptr[1]! / h });
  }
  return points;
}

function orderDocumentCorners(corners: NormPoint[]): NormPoint[] {
  const byY = [...corners].sort((a, b) => a.y - b.y);
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = byY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0]!, top[1]!, bottom[1]!, bottom[0]!];
}

function isValidQuad(corners: NormPoint[]): boolean {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  return bw > 0.12 && bh > 0.12 && bw < 0.99 && bh < 0.99;
}
