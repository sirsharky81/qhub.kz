import { describe, expect, it } from "vitest";
import { computeConfidence, computeStability, getDisplayTier } from "./confidence";
import { selectAlgorithm } from "./detector";
import { detectMpm, parabolicInterpolation } from "./mpm";
import { frequencyToNote } from "./notes";

function generateSine(frequency: number, sampleRate: number, length: number): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

describe("parabolicInterpolation", () => {
  it("returns peak offset near zero for symmetric peak", () => {
    expect(parabolicInterpolation(0.5, 1, 0.5)).toBeCloseTo(0, 5);
  });
});

describe("detectMpm", () => {
  it("detects 440 Hz sine within 5 cents", () => {
    const sampleRate = 44100;
    const buffer = generateSine(440, sampleRate, 4096);
    const result = detectMpm(buffer, sampleRate, 65, 450);
    expect(result.frequency).toBeGreaterThan(0);
    const centsError = 1200 * Math.log2(result.frequency / 440);
    expect(Math.abs(centsError)).toBeLessThan(5);
    expect(result.clarity).toBeGreaterThan(0.5);
  });

  it("detects E2 (~82.4 Hz) on larger buffer", () => {
    const sampleRate = 44100;
    const buffer = generateSine(82.41, sampleRate, 8192);
    const result = detectMpm(buffer, sampleRate, 65, 200);
    expect(result.frequency).toBeGreaterThan(0);
    const centsError = 1200 * Math.log2(result.frequency / 82.41);
    expect(Math.abs(centsError)).toBeLessThan(10);
  });
});

describe("frequencyToNote", () => {
  it("maps A4 to A4 with ~0 cents", () => {
    const { note, cents } = frequencyToNote(440);
    expect(note).toBe("A4");
    expect(Math.abs(cents)).toBeLessThanOrEqual(1);
  });
});

describe("selectAlgorithm", () => {
  it("uses MPM below 1000 Hz", () => {
    expect(selectAlgorithm([65, 450]).algorithm).toBe("mpm");
  });

  it("uses YIN at high chromatic range", () => {
    expect(selectAlgorithm([1000, 2000]).algorithm).toBe("yin");
  });
});

describe("computeConfidence", () => {
  it("returns high confidence for clean signal", () => {
    const score = computeConfidence({ clarity: 0.9, stability: 0.9, snr: 30 });
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("returns low confidence for noisy signal", () => {
    const score = computeConfidence({ clarity: 0.2, stability: 0.1, snr: 5 });
    expect(score).toBeLessThan(40);
  });
});

describe("computeStability", () => {
  it("returns high stability for identical frequencies", () => {
    expect(computeStability([440, 440, 440])).toBeGreaterThan(0.9);
  });
});

describe("getDisplayTier", () => {
  it("classifies tiers correctly", () => {
    expect(getDisplayTier(80)).toBe("stable");
    expect(getDisplayTier(50)).toBe("uncertain");
    expect(getDisplayTier(20)).toBe("hidden");
  });
});
