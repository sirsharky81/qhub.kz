import { clampPlaybackRate } from "./types";

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  if (size <= 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

function resampleLinear(input: Float32Array, rate: number): Float32Array {
  const outLen = Math.max(1, Math.round(input.length / rate));
  const out = new Float32Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = outLen === 1 ? 0 : (i * last) / (outLen - 1);
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(last, i0 + 1);
    const t = srcPos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

function findBestOffset(
  input: Float32Array,
  predicted: number,
  prevGrain: Float32Array,
  windowSize: number,
  overlap: number,
  searchRadius: number,
): number {
  const last = input.length - windowSize;
  if (last <= 0) return 0;
  const from = Math.max(0, predicted - searchRadius);
  const to = Math.min(last, predicted + searchRadius);
  let best = predicted;
  let bestErr = Infinity;
  const prevStart = windowSize - overlap;

  for (let candidate = from; candidate <= to; candidate++) {
    let err = 0;
    for (let i = 0; i < overlap; i++) {
      const d = prevGrain[prevStart + i] - input[candidate + i];
      err += d * d;
    }
    if (err < bestErr) {
      bestErr = err;
      best = candidate;
    }
  }
  return best;
}

/**
 * Pitch-preserving time stretch (WSOLA).
 * rate > 1 → faster / shorter; rate < 1 → slower / longer.
 */
export function timeStretch(input: Float32Array, rate: number, sampleRate = 44100): Float32Array {
  const r = clampPlaybackRate(rate);
  if (input.length === 0) return input.slice();
  if (Math.abs(r - 1) < 0.001) return input.slice();

  const sr = sampleRate > 0 ? sampleRate : 44100;
  const windowSize = sr >= 40000 ? 2048 : 1024;
  if (input.length < windowSize * 2) {
    return resampleLinear(input, r);
  }

  const synthesisHop = Math.floor(windowSize / 4);
  const analysisHop = Math.max(1, Math.round(synthesisHop * r));
  const searchRadius = Math.max(24, Math.round(sr * 0.0015));
  const overlap = Math.min(256, synthesisHop);
  const window = hannWindow(windowSize);

  const outputLength = Math.max(1, Math.round(input.length / r));
  const output = new Float32Array(outputLength + windowSize);
  const norm = new Float32Array(output.length);
  const fallback = resampleLinear(input, r);

  let predicted = 0;
  let outputPos = 0;
  let prevGrain: Float32Array | null = null;
  const maxStart = input.length - windowSize;

  while (outputPos < outputLength && maxStart >= 0) {
    let grainStart = Math.max(0, Math.min(maxStart, predicted));
    if (prevGrain) {
      grainStart = findBestOffset(input, grainStart, prevGrain, windowSize, overlap, searchRadius);
    }

    for (let i = 0; i < windowSize; i++) {
      const oi = outputPos + i;
      if (oi >= output.length) break;
      const w = window[i];
      output[oi] += input[grainStart + i] * w;
      norm[oi] += w;
    }

    prevGrain = input.subarray(grainStart, grainStart + windowSize);
    predicted += analysisHop;
    outputPos += synthesisHop;
    if (predicted > maxStart + searchRadius && outputPos >= outputLength) break;
  }

  const trimmed = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    if (norm[i] > 0.2) {
      trimmed[i] = output[i] / norm[i];
    } else if (i < fallback.length) {
      trimmed[i] = fallback[i];
    }
  }
  return trimmed;
}
