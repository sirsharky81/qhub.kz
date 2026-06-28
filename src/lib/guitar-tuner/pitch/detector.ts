import type { PitchAlgorithm } from "../types";

export interface PitchDetectorConfig {
  algorithm: PitchAlgorithm;
  minFrequency: number;
  maxFrequency: number;
}

export function selectAlgorithm(targetFrequencyRange: [number, number]): PitchDetectorConfig {
  const [min, max] = targetFrequencyRange;

  if (min < 1000) {
    return { algorithm: "mpm", minFrequency: min, maxFrequency: max };
  }

  return { algorithm: "yin", minFrequency: min, maxFrequency: max };
}
