export type InstrumentId = "guitar" | "bass" | "ukulele" | "chromatic";

export type PitchAlgorithm = "mpm" | "yin";

export interface PitchReading {
  frequency: number;
  clarity: number;
  timestamp: number;
  note: string;
  cents: number;
  confidence: number;
  rms: number;
  snr: number;
}

export interface PitchResult {
  frequency: number;
  clarity: number;
  note: string;
  cents: number;
  confidence: number;
  rms: number;
  snr: number;
  stable: boolean;
}

export type TunerDisplayState = "listening" | "uncertain" | "stable";

export interface TunerSettings {
  instrumentId: InstrumentId;
  tuningId: string;
  selectedStringIndex: number | null;
  micDeviceId: string | null;
  a4CalibrationCents: number;
}

export interface WorkletPitchMessage {
  type: "pitch";
  frequency: number;
  clarity: number;
  note: string;
  cents: number;
  confidence: number;
  rms: number;
  snr: number;
}

export interface WorkletConfigMessage {
  type: "config";
  bufferSize: number;
  minFrequency: number;
  maxFrequency: number;
  algorithm: PitchAlgorithm;
  analysisIntervalMs: number;
  a4CalibrationCents: number;
}
