import type { BeatGrid } from "./types";

const TARGET_RATE = 200;
const MIN_BPM = 60;
const MAX_BPM = 200;

function downsample(channel: Float32Array, sampleRate: number, targetRate: number): Float32Array {
  const ratio = Math.max(1, Math.floor(sampleRate / targetRate));
  const len = Math.floor(channel.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    const start = i * ratio;
    const end = Math.min(start + ratio, channel.length);
    for (let j = start; j < end; j++) sum += channel[j] * channel[j];
    out[i] = Math.sqrt(sum / (end - start));
  }
  return out;
}

function computeOnsetStrength(envelope: Float32Array): Float32Array {
  const out = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    const diff = envelope[i] - envelope[i - 1];
    out[i] = diff > 0 ? diff : 0;
  }
  return out;
}

function autocorrelate(signal: Float32Array, minLag: number, maxLag: number): { lag: number; score: number } {
  let bestLag = minLag;
  let bestScore = -Infinity;

  const mean =
    signal.reduce((s, v) => s + v, 0) / Math.max(1, signal.length);
  let energy = 0;
  for (let i = 0; i < signal.length; i++) {
    const d = signal[i] - mean;
    energy += d * d;
  }
  if (energy <= 0) return { lag: minLag, score: 0 };

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const n = signal.length - lag;
    for (let i = 0; i < n; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    const score = sum / (energy * n);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return { lag: bestLag, score: bestScore };
}

function findFirstOnset(onsets: Float32Array, sampleRate: number, fromSec = 0): number {
  const fromIdx = Math.floor(fromSec * sampleRate);
  let threshold = 0;
  const slice = onsets.subarray(fromIdx);
  for (let i = 0; i < slice.length; i++) threshold = Math.max(threshold, slice[i]);
  threshold *= 0.35;

  for (let i = Math.max(1, fromIdx); i < onsets.length; i++) {
    if (onsets[i] >= threshold && onsets[i] > onsets[i - 1]) {
      return i / sampleRate;
    }
  }
  return fromSec;
}

export function detectBeatGrid(
  buffer: AudioBuffer,
  range?: { start: number; end: number },
): BeatGrid {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const rangeStart = range?.start ?? 0;
  const rangeEnd = range?.end ?? buffer.duration;
  const startSample = Math.floor(rangeStart * sampleRate);
  const endSample = Math.min(channel.length, Math.ceil(rangeEnd * sampleRate));
  const slice = channel.subarray(startSample, endSample);

  const envelope = downsample(slice, sampleRate, TARGET_RATE);
  const onsets = computeOnsetStrength(envelope);
  const dsRate = sampleRate / Math.max(1, Math.floor(sampleRate / TARGET_RATE));

  const minLag = Math.floor((60 / MAX_BPM) * dsRate);
  const maxLag = Math.ceil((60 / MIN_BPM) * dsRate);
  const { lag, score } = autocorrelate(onsets, minLag, maxLag);

  const bpm = Math.round((60 * dsRate) / lag);
  const clampedBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  const offset = findFirstOnset(onsets, dsRate, 0) + rangeStart;

  const confidence = Math.max(0, Math.min(1, score * 2.5));

  return {
    bpm: clampedBpm,
    offset,
    confidence,
  };
}
