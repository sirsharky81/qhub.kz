import type { TuningPreset } from "./types";

export const bass4String: TuningPreset = {
  id: "4-string",
  name: "4 String",
  strings: [
    { name: "E1", frequency: 41.2 },
    { name: "A1", frequency: 55.0 },
    { name: "D2", frequency: 73.42 },
    { name: "G2", frequency: 98.0 },
  ],
  minExpectedFrequency: 41.2,
  recommendedBufferSize: 8192,
  minFrequency: 30,
  maxFrequency: 250,
};

export const bass5String: TuningPreset = {
  id: "5-string",
  name: "5 String",
  strings: [
    { name: "B0", frequency: 30.87 },
    { name: "E1", frequency: 41.2 },
    { name: "A1", frequency: 55.0 },
    { name: "D2", frequency: 73.42 },
    { name: "G2", frequency: 98.0 },
  ],
  minExpectedFrequency: 30.87,
  recommendedBufferSize: 8192,
  minFrequency: 28,
  maxFrequency: 250,
};

export const BASS_TUNINGS = [bass4String, bass5String];
