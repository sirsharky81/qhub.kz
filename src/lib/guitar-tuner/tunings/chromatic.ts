import type { TuningPreset } from "./types";

export const chromatic: TuningPreset = {
  id: "chromatic",
  name: "Chromatic",
  strings: [],
  minExpectedFrequency: 65,
  recommendedBufferSize: 4096,
  minFrequency: 65,
  maxFrequency: 2000,
};

export const CHROMATIC_TUNINGS = [chromatic];
