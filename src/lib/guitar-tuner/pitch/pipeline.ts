import {
  DEFAULT_NOISE_GATE_CONFIG,
  DEFAULT_SMOOTHING_CONFIG,
  computeRms,
  estimateSnrDb,
} from "../noise";
import type { PitchAlgorithm, PitchReading } from "../types";
import { computeConfidence, computeStability } from "./confidence";
import { selectAlgorithm } from "./detector";
import type { PitchDetectResult } from "./engine";
import { detectMpm } from "./mpm";
import { correctOctaveError, frequencyToNote, smoothCents } from "./notes";
import { detectYin } from "./yin";

const RECENT_MAX = 5;

export interface PitchPipelineConfig {
  minFrequency: number;
  maxFrequency: number;
  algorithm?: PitchAlgorithm;
  a4CalibrationCents?: number;
  rmsThreshold?: number;
  smoothingFactor?: number;
}

export class PitchPipeline {
  private recentReadings: PitchReading[] = [];
  private recentFrequencies: number[] = [];
  private smoothedCents: number | null = null;
  private noiseFloor = 0.001;
  private config: PitchPipelineConfig;

  constructor(config: PitchPipelineConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<PitchPipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  process(buffer: Float32Array, sampleRate: number): PitchReading | null {
    const rms = computeRms(buffer);
    const threshold = this.config.rmsThreshold ?? DEFAULT_NOISE_GATE_CONFIG.rmsThreshold;

    if (rms < threshold) {
      this.noiseFloor = Math.min(this.noiseFloor * 0.99 + rms * 0.01, threshold);
      return null;
    }

    const algo =
      this.config.algorithm ??
      selectAlgorithm([this.config.minFrequency, this.config.maxFrequency]).algorithm;

    let result: PitchDetectResult;
    if (algo === "yin") {
      result = detectYin(buffer, sampleRate, this.config.minFrequency, this.config.maxFrequency);
    } else {
      result = detectMpm(buffer, sampleRate, this.config.minFrequency, this.config.maxFrequency);
    }

    if (result.frequency <= 0 || result.clarity < DEFAULT_NOISE_GATE_CONFIG.minClarityToAccept) {
      return null;
    }

    const a4 = 440 * Math.pow(2, (this.config.a4CalibrationCents ?? 0) / 1200);
    let reading: PitchReading = {
      frequency: result.frequency,
      clarity: result.clarity,
      timestamp: Date.now(),
      ...frequencyToNote(result.frequency, a4),
      confidence: 0,
      rms,
      snr: estimateSnrDb(rms, this.noiseFloor),
    };

    reading = correctOctaveError(
      reading,
      this.recentReadings,
      buffer,
      sampleRate,
      this.config.minFrequency,
      this.config.maxFrequency,
    );

    this.recentFrequencies.push(reading.frequency);
    if (this.recentFrequencies.length > RECENT_MAX) this.recentFrequencies.shift();

    const stability = computeStability(this.recentFrequencies);
    reading.confidence = computeConfidence({
      clarity: reading.clarity,
      stability,
      snr: reading.snr,
    });

    const factor =
      this.config.smoothingFactor ??
      (reading.confidence >= 70
        ? DEFAULT_SMOOTHING_CONFIG.centsSmoothingFactor
        : DEFAULT_SMOOTHING_CONFIG.uncertainSmoothingFactor);

    reading.cents = Math.round(smoothCents(reading.cents, this.smoothedCents, factor));
    this.smoothedCents = reading.cents;

    this.recentReadings.push(reading);
    if (this.recentReadings.length > RECENT_MAX) this.recentReadings.shift();

    return reading;
  }

  reset(): void {
    this.recentReadings = [];
    this.recentFrequencies = [];
    this.smoothedCents = null;
  }
}
