import type { PitchReading } from "../types";
import { analyzeAlternativeOctave } from "./mpm";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function frequencyToNote(frequency: number, a4 = 440): { note: string; cents: number } {
  if (frequency <= 0 || !Number.isFinite(frequency)) {
    return { note: "—", cents: 0 };
  }

  const semitonesFromA4 = 12 * Math.log2(frequency / a4);
  const roundedSemitones = Math.round(semitonesFromA4);
  const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100);
  const noteIndex = ((roundedSemitones % 12) + 12 + 9) % 12;
  const octave = 4 + Math.floor((roundedSemitones + 9) / 12);
  const note = `${NOTE_NAMES[noteIndex]}${octave}`;

  return { note, cents };
}

export function getMedianFrequency(readings: PitchReading[]): number {
  if (readings.length === 0) return 0;
  const sorted = [...readings].map((r) => r.frequency).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function correctOctaveError(
  reading: PitchReading,
  recentReadings: PitchReading[],
  buffer: Float32Array,
  sampleRate: number,
  minFrequency: number,
  maxFrequency: number,
): PitchReading {
  if (recentReadings.length < 3 || reading.frequency <= 0) return reading;

  const median = getMedianFrequency(recentReadings);
  if (median <= 0) return reading;

  const ratio = reading.frequency / median;
  const isLikelyOctaveUp = ratio > 1.9 && ratio < 2.1;
  const isLikelyOctaveDown = ratio > 0.45 && ratio < 0.55;

  if (!isLikelyOctaveUp && !isLikelyOctaveDown) return reading;

  const resolved = analyzeAlternativeOctave(
    buffer,
    sampleRate,
    reading.frequency,
    minFrequency,
    maxFrequency,
  );

  if (resolved.clarity < 0.6) return reading;

  const { note, cents } = frequencyToNote(resolved.frequency);
  return {
    ...reading,
    frequency: resolved.frequency,
    clarity: resolved.clarity,
    note,
    cents,
  };
}

export function smoothCents(current: number, previous: number | null, factor: number): number {
  if (previous === null) return current;
  return factor * current + (1 - factor) * previous;
}
