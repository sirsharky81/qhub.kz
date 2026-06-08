import type { Landmarks68 } from "./landmarkAdapter";

export interface FaceDetectionResult {
  box: { x: number; y: number; width: number; height: number };
  landmarks: Landmarks68;
}

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

/** Lazy-загрузка моделей face-api.js (только при открытии шага 2) */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const faceapi = await import("face-api.js");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
    ]);
    modelsLoaded = true;
  })();

  return loadPromise;
}

/** Детекция лица и 68 landmarks на нормализованном canvas/img */
export async function detectFace(
  input: HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetectionResult | null> {
  await loadFaceModels();
  const faceapi = await import("face-api.js");

  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks(true);

  if (!detection) return null;

  const box = detection.detection.box;
  const positions = detection.landmarks.positions;
  const landmarks: Landmarks68 = positions.map((p) => ({ x: p.x, y: p.y }));

  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    landmarks,
  };
}

export function isModelsLoaded(): boolean {
  return modelsLoaded;
}
