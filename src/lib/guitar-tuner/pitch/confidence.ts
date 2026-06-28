import type { PitchReading } from "../types";

export interface ConfidenceInputs {
  clarity: number;
  stability: number;
  snr: number;
}

export function computeStability(recentFrequencies: number[]): number {
  if (recentFrequencies.length < 2) return 0;

  const mean = recentFrequencies.reduce((a, b) => a + b, 0) / recentFrequencies.length;
  if (mean <= 0) return 0;

  const variance =
    recentFrequencies.reduce((sum, f) => sum + (f - mean) ** 2, 0) / recentFrequencies.length;
  const stdDevRatio = Math.sqrt(variance) / mean;

  return Math.min(Math.max(1 - stdDevRatio * 10, 0), 1);
}

export function computeConfidence({ clarity, stability, snr }: ConfidenceInputs): number {
  const normalizedSnr = Math.min(Math.max(snr / 30, 0), 1);

  const confidence = clarity * 0.5 + stability * 0.3 + normalizedSnr * 0.2;

  return Math.round(confidence * 100);
}

export function passesStabilityGate(
  recentReadings: PitchReading[],
  centsTolerance = 5,
  minConfidence = 70,
  requiredCount = 3,
): boolean {
  if (recentReadings.length < requiredCount) return false;

  const last = recentReadings.slice(-requiredCount);
  if (last.some((r) => r.confidence < minConfidence || r.frequency <= 0)) return false;

  const baseCents = last[0].cents;
  return last.every((r) => Math.abs(r.cents - baseCents) <= centsTolerance);
}

export function getDisplayTier(confidence: number): "hidden" | "uncertain" | "stable" {
  if (confidence < 40) return "hidden";
  if (confidence < 70) return "uncertain";
  return "stable";
}
