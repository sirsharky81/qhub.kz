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

function grainWindowSize(sampleRate: number): number {
  const target = Math.round(sampleRate * 0.042);
  let n = 1024;
  while (n < target) n *= 2;
  return Math.min(4096, n);
}

function mixForAnalysis(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const mid = new Float32Array(len);
  const scale = 1 / channels.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    mid[i] = sum * scale;
  }
  return mid;
}

/**
 * Normalized cross-correlation of the overlap between the previous grain
 * and a candidate grain. Decimated for speed; same offsets applied to all channels.
 */
function findBestOffset(
  analysis: Float32Array,
  predicted: number,
  prevStart: number,
  windowSize: number,
  overlap: number,
  searchRadius: number,
  maxStart: number,
): number {
  const from = Math.max(0, predicted - searchRadius);
  const to = Math.min(maxStart, predicted + searchRadius);
  const prevOff = prevStart + windowSize - overlap;
  let best = Math.max(0, Math.min(maxStart, predicted));
  let bestScore = -Infinity;
  const step = overlap > 400 ? 2 : 1;

  for (let candidate = from; candidate <= to; candidate++) {
    let corr = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < overlap; i += step) {
      const a = analysis[prevOff + i];
      const b = analysis[candidate + i];
      corr += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const score = corr / (Math.sqrt(e1 * e2) + 1e-12);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function planGrainStarts(
  analysis: Float32Array,
  rate: number,
  windowSize: number,
  synthesisHop: number,
  outputLength: number,
  sampleRate: number,
): number[] {
  const analysisHop = Math.max(1, Math.round(synthesisHop * rate));
  const overlap = windowSize - synthesisHop;
  const corrLen = Math.min(overlap, 320);
  const searchRadius = Math.max(64, Math.min(Math.floor(windowSize / 6), Math.round(sampleRate * 0.01)));
  const maxStart = Math.max(0, analysis.length - windowSize);
  const starts: number[] = [];
  let predicted = 0;
  let outputPos = 0;

  while (outputPos < outputLength) {
    let start = Math.max(0, Math.min(maxStart, predicted));
    if (starts.length > 0 && maxStart > 0) {
      start = findBestOffset(
        analysis,
        start,
        starts[starts.length - 1],
        windowSize,
        corrLen,
        searchRadius,
        maxStart,
      );
    }
    starts.push(start);
    predicted += analysisHop;
    outputPos += synthesisHop;
    if (predicted > maxStart) predicted = maxStart;
    if (starts.length > outputLength + 2) break;
  }
  return starts;
}

function overlapAdd(
  input: Float32Array,
  starts: number[],
  window: Float32Array,
  windowSize: number,
  hop: number,
  outputLength: number,
): Float32Array {
  const acc = new Float32Array(outputLength + windowSize);
  const norm = new Float32Array(acc.length);
  let pos = 0;
  for (const start of starts) {
    const grainStart = Math.max(0, Math.min(input.length - windowSize, start));
    for (let i = 0; i < windowSize; i++) {
      const src = grainStart + i;
      if (src >= input.length) break;
      const w = window[i];
      acc[pos + i] += input[src] * w;
      norm[pos + i] += w;
    }
    pos += hop;
  }

  const out = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    out[i] = norm[i] > 1e-6 ? acc[i] / norm[i] : acc[i];
  }
  return out;
}

/**
 * Pitch-preserving time stretch (WSOLA).
 * rate > 1 → faster / shorter; rate < 1 → slower / longer.
 * Same grain schedule is applied to every channel so stereo stays intact.
 */
export function timeStretchPlanar(
  channels: Float32Array[],
  rate: number,
  sampleRate = 44100,
): Float32Array[] {
  if (channels.length === 0) return [];
  const r = clampPlaybackRate(rate);
  if (channels[0].length === 0) return channels.map((ch) => ch.slice());
  if (Math.abs(r - 1) < 0.0005) return channels.map((ch) => ch.slice());

  const sr = sampleRate > 0 ? sampleRate : 44100;
  const windowSize = grainWindowSize(sr);
  const outputLength = Math.max(1, Math.round(channels[0].length / r));

  if (channels[0].length < windowSize * 2) {
    return channels.map((ch) => resampleCubic(ch, outputLength));
  }

  const synthesisHop = Math.floor(windowSize / 4);
  const analysis = mixForAnalysis(channels);
  const starts = planGrainStarts(analysis, r, windowSize, synthesisHop, outputLength, sr);
  const window = hannWindow(windowSize);
  return channels.map((ch) => overlapAdd(ch, starts, window, windowSize, synthesisHop, outputLength));
}

function resampleCubic(input: Float32Array, outLen: number): Float32Array {
  const out = new Float32Array(outLen);
  const last = input.length - 1;
  if (last <= 0) {
    if (input.length > 0) out.fill(input[0]);
    return out;
  }
  for (let i = 0; i < outLen; i++) {
    const srcPos = outLen === 1 ? 0 : (i * last) / (outLen - 1);
    const i1 = Math.floor(srcPos);
    const t = srcPos - i1;
    const i0 = Math.max(0, i1 - 1);
    const i2 = Math.min(last, i1 + 1);
    const i3 = Math.min(last, i1 + 2);
    const a0 = input[i3] - input[i2] - input[i0] + input[i1];
    const a1 = input[i0] - input[i1] - a0;
    const a2 = input[i2] - input[i0];
    const a3 = input[i1];
    out[i] = a0 * t * t * t + a1 * t * t + a2 * t + a3;
  }
  return out;
}

export function timeStretch(input: Float32Array, rate: number, sampleRate = 44100): Float32Array {
  return timeStretchPlanar([input], rate, sampleRate)[0];
}
