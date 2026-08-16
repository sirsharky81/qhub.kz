import {
  cloneEq,
  FLAT_EQ,
  isFlatEq,
  type EqSettings,
} from "./types";
import { clampBuffer } from "./audio-dsp";

export const EQ_BANDS = [
  { key: "bass" as const, label: "Бас", hz: "60", freq: 60, type: "lowshelf" as const, q: 0.7 },
  { key: "low" as const, label: "Низ", hz: "250", freq: 250, type: "peaking" as const, q: 1 },
  { key: "mid" as const, label: "Середина", hz: "1k", freq: 1000, type: "peaking" as const, q: 1 },
  { key: "high" as const, label: "Верх", hz: "4k", freq: 4000, type: "peaking" as const, q: 1 },
  { key: "air" as const, label: "Воздух", hz: "12k", freq: 12000, type: "highshelf" as const, q: 0.7 },
];

export const EQ_PRESETS: { id: string; label: string; eq: EqSettings }[] = [
  { id: "flat", label: "Плоский", eq: cloneEq(FLAT_EQ) },
  { id: "voice", label: "Голос", eq: { bass: -4, low: -2, mid: 2, high: 3, air: 1 } },
  { id: "brighter", label: "Ярче", eq: { bass: -1, low: 0, mid: 1, high: 3, air: 4 } },
  { id: "softer", label: "Мягче", eq: { bass: 1, low: 1, mid: 0, high: -3, air: -4 } },
  { id: "less-bass", label: "Меньше баса", eq: { bass: -6, low: -3, mid: 0, high: 1, air: 0 } },
];

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function peakingCoeffs(freq: number, sampleRate: number, dbGain: number, q: number): BiquadCoeffs {
  const A = 10 ** (dbGain / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosw;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha / A;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function shelfCoeffs(
  freq: number,
  sampleRate: number,
  dbGain: number,
  q: number,
  low: boolean,
): BiquadCoeffs {
  const A = 10 ** (dbGain / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * q);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  if (low) {
    const b0 = A * (A + 1 - (A - 1) * cosw + twoSqrtAAlpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cosw);
    const b2 = A * (A + 1 - (A - 1) * cosw - twoSqrtAAlpha);
    const a0 = A + 1 + (A - 1) * cosw + twoSqrtAAlpha;
    const a1 = -2 * (A - 1 + (A + 1) * cosw);
    const a2 = A + 1 + (A - 1) * cosw - twoSqrtAAlpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  const b0 = A * (A + 1 + (A - 1) * cosw + twoSqrtAAlpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cosw);
  const b2 = A * (A + 1 + (A - 1) * cosw - twoSqrtAAlpha);
  const a0 = A + 1 - (A - 1) * cosw + twoSqrtAAlpha;
  const a1 = 2 * (A - 1 - (A + 1) * cosw);
  const a2 = A + 1 - (A - 1) * cosw - twoSqrtAAlpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(input: Float32Array, c: BiquadCoeffs): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

const EQ_PAD = 64;

/** Apply graphic EQ in-place-style (returns a new buffer). Flat EQ is a copy. */
export function applyEq(input: Float32Array, sampleRate: number, eq: EqSettings): Float32Array {
  if (input.length === 0 || sampleRate <= 0 || isFlatEq(eq)) {
    return input.slice();
  }

  const padded = new Float32Array(input.length + EQ_PAD * 2);
  padded.set(input, EQ_PAD);
  let data: Float32Array = padded;

  for (const band of EQ_BANDS) {
    const gain = eq[band.key];
    if (!gain) continue;
    const nyquist = sampleRate / 2 - 1;
    const freq = Math.min(band.freq, nyquist);
    const coeffs =
      band.type === "peaking"
        ? peakingCoeffs(freq, sampleRate, gain, band.q)
        : shelfCoeffs(freq, sampleRate, gain, band.q, band.type === "lowshelf");
    data = applyBiquad(data, coeffs);
  }

  const trimmed = data.subarray(EQ_PAD, EQ_PAD + input.length);
  const out = trimmed.slice();
  clampBuffer(out);
  return out;
}
