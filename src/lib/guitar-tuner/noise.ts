export interface NoiseGateConfig {
  rmsThreshold: number;
  lowPassCutoffHz: number;
  minClarityToAccept: number;
}

export interface SmoothingConfig {
  centsSmoothingFactor: number;
  uncertainSmoothingFactor: number;
}

export const DEFAULT_NOISE_GATE_CONFIG: NoiseGateConfig = {
  rmsThreshold: 0.01,
  lowPassCutoffHz: 1000,
  minClarityToAccept: 0.6,
};

export const DEFAULT_SMOOTHING_CONFIG: SmoothingConfig = {
  centsSmoothingFactor: 0.3,
  uncertainSmoothingFactor: 0.15,
};

export function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

export function estimateSnrDb(signalRms: number, noiseFloor: number): number {
  const floor = Math.max(noiseFloor, 1e-6);
  const ratio = Math.max(signalRms, floor) / floor;
  return 20 * Math.log10(ratio);
}
