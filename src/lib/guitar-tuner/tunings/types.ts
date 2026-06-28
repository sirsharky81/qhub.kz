export interface TuningString {
  name: string;
  frequency: number;
}

export interface TuningPreset {
  id: string;
  name: string;
  strings: TuningString[];
  minExpectedFrequency: number;
  recommendedBufferSize: 4096 | 8192;
  minFrequency: number;
  maxFrequency: number;
}

export interface InstrumentDefinition {
  id: "guitar" | "bass" | "ukulele" | "chromatic";
  name: string;
  tunings: TuningPreset[];
}
