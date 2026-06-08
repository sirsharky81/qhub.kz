import type { Landmarks68 } from "./landmarkAdapter";

export interface FaceDetectionResult {
  box: { x: number; y: number; width: number; height: number };
  landmarks: Landmarks68;
}

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

function modelBaseUrl(): string {
  if (typeof window === "undefined") return "/models";
  return `${window.location.origin}/models`;
}

/** Lazy-загрузка моделей face-api.js (только при открытии шага 2) */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const faceapi = await import("face-api.js");
    const uri = modelBaseUrl();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(uri),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(uri),
    ]);
    modelsLoaded = true;
  })();

  return loadPromise;
}

type DetectionWithLandmarks = {
  detection: { box: { x: number; y: number; width: number; height: number } };
  landmarks: { positions: Array<{ x: number; y: number }> };
};

function mapDetection(detection: DetectionWithLandmarks): FaceDetectionResult {
  const box = detection.detection.box;
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    landmarks: detection.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
  };
}

function boxArea(box: { width: number; height: number }): number {
  return box.width * box.height;
}

/** Детекция лица и 68 landmarks — несколько попыток с разными порогами */
export async function detectFace(
  input: HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetectionResult | null> {
  await loadFaceModels();
  const faceapi = await import("face-api.js");

  const optionSets = [
    { inputSize: 608, scoreThreshold: 0.2 },
    { inputSize: 512, scoreThreshold: 0.25 },
    { inputSize: 416, scoreThreshold: 0.3 },
  ];

  for (const opts of optionSets) {
    const detection = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions(opts))
      .withFaceLandmarks(true);
    if (detection) return mapDetection(detection);
  }

  const all = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.15 }))
    .withFaceLandmarks(true);

  if (all.length > 0) {
    const best = all.reduce((a, b) =>
      boxArea(a.detection.box) > boxArea(b.detection.box) ? a : b
    );
    return mapDetection(best);
  }

  return null;
}

export function isModelsLoaded(): boolean {
  return modelsLoaded;
}
