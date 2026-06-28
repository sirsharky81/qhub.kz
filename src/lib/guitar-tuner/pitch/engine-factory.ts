import { selectAlgorithm } from "./detector";
import type { PitchEngine, PitchEngineOptions } from "./engine";
import { detectMpm } from "./mpm";
import { detectYin } from "./yin";

export function createJsPitchEngine(options: PitchEngineOptions): PitchEngine {
  const config = options.algorithm
    ? options
    : selectAlgorithm([options.minFrequency, options.maxFrequency]);

  return {
    detect(buffer, sampleRate) {
      if (config.algorithm === "yin") {
        return detectYin(buffer, sampleRate, config.minFrequency, config.maxFrequency);
      }
      return detectMpm(buffer, sampleRate, config.minFrequency, config.maxFrequency);
    },
  };
}

export const pitchEngine = createJsPitchEngine({
  algorithm: "mpm",
  minFrequency: 65,
  maxFrequency: 450,
});
