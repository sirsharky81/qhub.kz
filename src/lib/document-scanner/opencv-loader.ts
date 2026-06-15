/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    cv?: OpenCVInstance;
  }
}

export type OpenCVInstance = {
  Mat: new (...args: any[]) => CvMat;
  MatVector: new (...args: any[]) => CvMatVector;
  Size: new (w: number, h: number) => unknown;
  imread: (canvas: HTMLCanvasElement) => CvMat;
  imshow: (canvas: HTMLCanvasElement, mat: CvMat) => void;
  resize: (...args: any[]) => void;
  cvtColor: (...args: any[]) => void;
  GaussianBlur: (...args: any[]) => void;
  adaptiveThreshold: (...args: any[]) => void;
  morphologyEx: (...args: any[]) => void;
  getStructuringElement: (...args: any[]) => CvMat;
  findContours: (...args: any[]) => void;
  arcLength: (...args: any[]) => number;
  approxPolyDP: (...args: any[]) => void;
  contourArea: (m: CvMat) => number;
  convexHull: (...args: any[]) => void;
  matFromArray: (...args: any[]) => CvMat;
  getPerspectiveTransform: (...args: any[]) => CvMat;
  warpPerspective: (...args: any[]) => void;
  COLOR_RGBA2GRAY: number;
  COLOR_RGB2GRAY: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_32FC2: number;
  BORDER_CONSTANT: number;
  onRuntimeInitialized?: () => void;
};

type CvMat = {
  rows: number;
  cols: number;
  channels: () => number;
  copyTo: (dst: CvMat) => void;
  delete: () => void;
  intPtr: (row: number, col: number) => Int32Array;
};

type CvMatVector = {
  size: () => number;
  get: (i: number) => CvMat;
  delete: () => void;
};

const OPENCV_CDN =
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";

let cvPromise: Promise<OpenCVInstance> | null = null;

export function isOpenCVReady(): boolean {
  return typeof window !== "undefined" && !!window.cv?.Mat;
}

function startLoadOpenCV(): Promise<OpenCVInstance> {
  return new Promise((resolve, reject) => {
    const ready = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error("OpenCV failed to initialize"));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
        return;
      }
      cv.onRuntimeInitialized = () => resolve(cv);
    };

    if (window.cv) {
      ready();
      return;
    }

    const existing = document.querySelector(`script[src="${OPENCV_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", ready);
      existing.addEventListener("error", () => reject(new Error("OpenCV script error")));
      return;
    }

    const script = document.createElement("script");
    script.src = OPENCV_CDN;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("Failed to load OpenCV.js"));
    document.head.appendChild(script);
  });
}

/** Load OpenCV lazily — call when user taps «Авто» or confirms crop. */
export function ensureOpenCVLoading(): void {
  if (typeof window === "undefined" || isOpenCVReady()) return;
  if (!cvPromise) cvPromise = startLoadOpenCV();
  void cvPromise.catch(() => {
    cvPromise = null;
  });
}

export function loadOpenCV(): Promise<OpenCVInstance> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV is browser-only"));
  }
  if (!cvPromise) cvPromise = startLoadOpenCV();
  return cvPromise;
}

/** Returns null instead of blocking indefinitely on slow CDN. */
export async function loadOpenCVWithTimeout(ms: number): Promise<OpenCVInstance | null> {
  if (isOpenCVReady()) return window.cv!;
  try {
    const { withTimeout } = await import("./async-utils");
    return await withTimeout(loadOpenCV(), ms, "opencv-timeout");
  } catch {
    return null;
  }
}
