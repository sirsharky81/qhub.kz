declare module "face-api.js" {
  export const nets: {
    tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> };
    faceLandmark68TinyNet: { loadFromUri: (uri: string) => Promise<void> };
  };
  export class TinyFaceDetectorOptions {
    constructor(options?: { inputSize?: number; scoreThreshold?: number });
  }
  export function detectSingleFace(
    input: HTMLCanvasElement | HTMLImageElement,
    options: TinyFaceDetectorOptions
  ): {
    withFaceLandmarks: (useTinyModel?: boolean) => Promise<{
      detection: { box: { x: number; y: number; width: number; height: number } };
      landmarks: { positions: Array<{ x: number; y: number }> };
    } | undefined>;
  };
}
