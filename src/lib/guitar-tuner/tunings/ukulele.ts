import type { TuningPreset } from "./types";

export const ukuleleStandard: TuningPreset = {
  id: "standard",
  name: "Standard (GCEA)",
  strings: [
    { name: "G4", frequency: 392.0 },
    { name: "C4", frequency: 261.63 },
    { name: "E4", frequency: 329.63 },
    { name: "A4", frequency: 440.0 },
  ],
  minExpectedFrequency: 261.63,
  recommendedBufferSize: 4096,
  minFrequency: 200,
  maxFrequency: 500,
};

export const ukuleleBaritone: TuningPreset = {
  id: "baritone",
  name: "Baritone (DGBE)",
  strings: [
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "B3", frequency: 246.94 },
    { name: "E4", frequency: 329.63 },
  ],
  minExpectedFrequency: 146.83,
  recommendedBufferSize: 4096,
  minFrequency: 120,
  maxFrequency: 450,
};

export const UKULELE_TUNINGS = [ukuleleStandard, ukuleleBaritone];
