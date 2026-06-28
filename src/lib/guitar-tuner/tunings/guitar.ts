import type { TuningPreset } from "./types";

export const guitarStandard: TuningPreset = {
  id: "standard",
  name: "Standard",
  strings: [
    { name: "E2", frequency: 82.41 },
    { name: "A2", frequency: 110.0 },
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "B3", frequency: 246.94 },
    { name: "E4", frequency: 329.63 },
  ],
  minExpectedFrequency: 82.41,
  recommendedBufferSize: 4096,
  minFrequency: 65,
  maxFrequency: 450,
};

export const guitarDropD: TuningPreset = {
  id: "drop-d",
  name: "Drop D",
  strings: [
    { name: "D2", frequency: 73.42 },
    { name: "A2", frequency: 110.0 },
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "B3", frequency: 246.94 },
    { name: "E4", frequency: 329.63 },
  ],
  minExpectedFrequency: 73.42,
  recommendedBufferSize: 4096,
  minFrequency: 65,
  maxFrequency: 450,
};

export const guitarDadgad: TuningPreset = {
  id: "dadgad",
  name: "DADGAD",
  strings: [
    { name: "D2", frequency: 73.42 },
    { name: "A2", frequency: 110.0 },
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "A3", frequency: 220.0 },
    { name: "D4", frequency: 293.66 },
  ],
  minExpectedFrequency: 73.42,
  recommendedBufferSize: 4096,
  minFrequency: 65,
  maxFrequency: 450,
};

export const guitarOpenG: TuningPreset = {
  id: "open-g",
  name: "Open G",
  strings: [
    { name: "D2", frequency: 73.42 },
    { name: "G2", frequency: 98.0 },
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "B3", frequency: 246.94 },
    { name: "D4", frequency: 293.66 },
  ],
  minExpectedFrequency: 73.42,
  recommendedBufferSize: 4096,
  minFrequency: 65,
  maxFrequency: 450,
};

export const GUITAR_TUNINGS = [guitarStandard, guitarDropD, guitarDadgad, guitarOpenG];
