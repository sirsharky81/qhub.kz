import type { PitchDetectResult } from "./engine";

/** Parabolic interpolation around peak index for sub-sample lag accuracy. */
export function parabolicInterpolation(y0: number, y1: number, y2: number): number {
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return 0;
  return 0.5 * (y0 - y2) / denom;
}

function computeNsdf(buffer: Float32Array, maxLag: number): Float32Array {
  const nsdf = new Float32Array(maxLag + 1);
  const n = buffer.length;

  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    let m0 = 0;
    let mTau = 0;
    const limit = n - tau;
    for (let i = 0; i < limit; i++) {
      acf += buffer[i] * buffer[i + tau];
      m0 += buffer[i] * buffer[i];
      mTau += buffer[i + tau] * buffer[i + tau];
    }
    const denom = m0 + mTau;
    nsdf[tau] = denom > 0 ? (2 * acf) / denom : 0;
  }

  return nsdf;
}

function findPeaks(nsdf: Float32Array, minLag: number, maxLag: number): number[] {
  const peaks: number[] = [];
  for (let i = minLag + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1] && nsdf[i] > 0) {
      peaks.push(i);
    }
  }
  return peaks;
}

export function detectMpm(
  buffer: Float32Array,
  sampleRate: number,
  minFrequency: number,
  maxFrequency: number,
): PitchDetectResult {
  const minLag = Math.floor(sampleRate / maxFrequency);
  const maxLag = Math.min(Math.ceil(sampleRate / minFrequency), buffer.length - 1);

  if (maxLag <= minLag + 2) {
    return { frequency: 0, clarity: 0 };
  }

  const nsdf = computeNsdf(buffer, maxLag);
  const peaks = findPeaks(nsdf, minLag, maxLag);

  if (peaks.length === 0) {
    return { frequency: 0, clarity: 0 };
  }

  let maxClarity = 0;
  for (const lag of peaks) {
    if (nsdf[lag] > maxClarity) maxClarity = nsdf[lag];
  }

  const sortedPeaks = [...peaks].sort((a, b) => a - b);
  let bestLag = sortedPeaks[0];
  let bestClarity = nsdf[bestLag];

  for (const lag of sortedPeaks) {
    const clarity = nsdf[lag];
    if (clarity >= maxClarity * 0.95 && lag < bestLag) {
      bestLag = lag;
      bestClarity = clarity;
    }
  }

  const offset = parabolicInterpolation(
    nsdf[bestLag - 1] ?? 0,
    nsdf[bestLag],
    nsdf[bestLag + 1] ?? 0,
  );
  const refinedLag = bestLag + offset;
  const frequency = refinedLag > 0 ? sampleRate / refinedLag : 0;

  return { frequency, clarity: Math.min(Math.max(bestClarity, 0), 1) };
}

export function analyzeAlternativeOctave(
  buffer: Float32Array,
  sampleRate: number,
  candidateFrequency: number,
  minFrequency: number,
  maxFrequency: number,
): PitchDetectResult {
  const half = candidateFrequency / 2;
  const double = candidateFrequency * 2;

  const candidates: number[] = [candidateFrequency];
  if (half >= minFrequency) candidates.push(half);
  if (double <= maxFrequency) candidates.push(double);

  let best: PitchDetectResult = { frequency: candidateFrequency, clarity: 0 };

  for (const freq of candidates) {
    const expectedLag = sampleRate / freq;
    const minLag = Math.max(2, Math.floor(expectedLag * 0.85));
    const maxLag = Math.min(Math.ceil(expectedLag * 1.15), buffer.length - 1);
    const nsdf = computeNsdf(buffer, maxLag);

    let localBest = 0;
    let localLag = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (nsdf[lag] > localBest) {
        localBest = nsdf[lag];
        localLag = lag;
      }
    }

    const offset = parabolicInterpolation(
      nsdf[localLag - 1] ?? 0,
      nsdf[localLag],
      nsdf[localLag + 1] ?? 0,
    );
    const refinedFreq = sampleRate / (localLag + offset);

    if (localBest > best.clarity) {
      best = { frequency: refinedFreq, clarity: localBest };
    }
  }

  return best;
}
