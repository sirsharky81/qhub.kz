import type { PitchAlgorithm } from "../types";

export interface PitchDetectResult {
  frequency: number;
  clarity: number;
}

export interface PitchEngine {
  detect(buffer: Float32Array, sampleRate: number): PitchDetectResult;
}

export interface PitchEngineOptions {
  algorithm: PitchAlgorithm;
  minFrequency: number;
  maxFrequency: number;
}
