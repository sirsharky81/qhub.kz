/** Shared DSP helpers — fade, crossfade, clamping (no clicks / clipping). */

export function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function clampBuffer(data: Float32Array): void {
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    data[i] = Math.abs(v) < 1e-10 ? 0 : clampSample(v);
  }
}

function normalizeFadeLengths(
  length: number,
  fadeInSamples: number,
  fadeOutSamples: number,
): { fadeInSamples: number; fadeOutSamples: number } {
  let inS = Math.max(0, Math.min(fadeInSamples, length));
  let outS = Math.max(0, Math.min(fadeOutSamples, length));

  if (inS + outS > length) {
    if (length <= 1) {
      return { fadeInSamples: length > 0 ? 1 : 0, fadeOutSamples: length > 0 ? 1 : 0 };
    }
    const inRatio = inS / (inS + outS);
    inS = Math.max(1, Math.round(inRatio * length));
    outS = Math.max(1, length - inS);
    if (inS + outS > length) outS = length - inS;
  }

  return { fadeInSamples: inS, fadeOutSamples: outS };
}

/**
 * Linear fade with exact zero at the first sample (fade-in) and last sample (fade-out).
 */
export function applyFade(
  data: Float32Array,
  sampleRate: number,
  fadeInSec: number,
  fadeOutSec: number,
): void {
  const len = data.length;
  if (len === 0 || sampleRate <= 0) return;

  const { fadeInSamples, fadeOutSamples } = normalizeFadeLengths(
    len,
    Math.floor(fadeInSec * sampleRate),
    Math.floor(fadeOutSec * sampleRate),
  );

  if (fadeInSamples > 0) {
    if (fadeInSamples === 1) {
      data[0] = 0;
    } else {
      const denom = fadeInSamples - 1;
      for (let i = 0; i < fadeInSamples; i++) {
        data[i] *= i / denom;
      }
    }
  }

  if (fadeOutSamples > 0) {
    const fadeOutStart = len - fadeOutSamples;
    if (fadeOutSamples === 1) {
      data[len - 1] = 0;
    } else {
      const denom = fadeOutSamples - 1;
      for (let i = fadeOutStart; i < len; i++) {
        data[i] *= (len - 1 - i) / denom;
      }
    }
  }
}

export function crossfadeGainOut(j: number, crossfadeSamples: number): number {
  if (crossfadeSamples <= 0) return 1;
  if (crossfadeSamples === 1) return 0.5;
  return (crossfadeSamples - 1 - j) / (crossfadeSamples - 1);
}

export function crossfadeGainIn(j: number, crossfadeSamples: number): number {
  if (crossfadeSamples <= 0) return 0;
  if (crossfadeSamples === 1) return 0.5;
  return j / (crossfadeSamples - 1);
}

export function mixCrossfadeSample(
  prev: number,
  next: number,
  j: number,
  crossfadeSamples: number,
): number {
  const fadeOut = crossfadeGainOut(j, crossfadeSamples);
  const fadeIn = crossfadeGainIn(j, crossfadeSamples);
  return clampSample(prev * fadeOut + next * fadeIn);
}

/** Sanity checks for unit-style verification (dev / scripts). */
export function verifyFadeIntegrity(
  data: Float32Array,
  sampleRate: number,
  fadeInSec: number,
  fadeOutSec: number,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const len = data.length;
  if (len === 0) return { ok: true, errors };

  const { fadeInSamples, fadeOutSamples } = normalizeFadeLengths(
    len,
    Math.floor(fadeInSec * sampleRate),
    Math.floor(fadeOutSec * sampleRate),
  );

  if (fadeInSamples > 0 && Math.abs(data[0]) > 1e-6) {
    errors.push(`fade-in start not zero: ${data[0]}`);
  }
  if (fadeOutSamples > 0 && Math.abs(data[len - 1]) > 1e-6) {
    errors.push(`fade-out end not zero: ${data[len - 1]}`);
  }

  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(data[i]) || Math.abs(data[i]) > 1.0001) {
      errors.push(`sample ${i} out of range: ${data[i]}`);
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}
