/**
 * Quick sanity check for fade/crossfade DSP (no clicks at boundaries).
 * Run: node scripts/verify-audio-dsp.mjs
 */

const SAMPLE_RATE = 44100;

function clampSample(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function normalizeFadeLengths(length, fadeInSamples, fadeOutSamples) {
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

function applyFade(data, sampleRate, fadeInSec, fadeOutSec) {
  const len = data.length;
  if (len === 0) return;
  const { fadeInSamples, fadeOutSamples } = normalizeFadeLengths(
    len,
    Math.floor(fadeInSec * sampleRate),
    Math.floor(fadeOutSec * sampleRate),
  );
  if (fadeInSamples > 0) {
    if (fadeInSamples === 1) data[0] = 0;
    else {
      const denom = fadeInSamples - 1;
      for (let i = 0; i < fadeInSamples; i++) data[i] *= i / denom;
    }
  }
  if (fadeOutSamples > 0) {
    const fadeOutStart = len - fadeOutSamples;
    if (fadeOutSamples === 1) data[len - 1] = 0;
    else {
      const denom = fadeOutSamples - 1;
      for (let i = fadeOutStart; i < len; i++) data[i] *= (len - 1 - i) / denom;
    }
  }
}

function mixCrossfadeSample(prev, next, j, crossfadeSamples) {
  const fadeOut =
    crossfadeSamples <= 0
      ? 1
      : crossfadeSamples === 1
        ? 0.5
        : (crossfadeSamples - 1 - j) / (crossfadeSamples - 1);
  const fadeIn =
    crossfadeSamples <= 0
      ? 0
      : crossfadeSamples === 1
        ? 0.5
        : j / (crossfadeSamples - 1);
  return clampSample(prev * fadeOut + next * fadeIn);
}

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    failed++;
  } else {
    console.log(`OK: ${name}`);
  }
}

// Fade-out must end at exact zero
for (const fadeSec of [0.5, 1, 3, 5, 10, 25]) {
  const len = Math.floor(10 * SAMPLE_RATE);
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) data[i] = Math.sin((i / SAMPLE_RATE) * 440 * Math.PI * 2) * 0.8;
  applyFade(data, SAMPLE_RATE, 0, fadeSec);
  assert(`fade-out ${fadeSec}s ends at zero`, Math.abs(data[len - 1]) < 1e-6);
  assert(`fade-out ${fadeSec}s no clipping`, data.every((s) => Math.abs(s) <= 1.0001));
}

// Fade-in must start at zero
{
  const len = Math.floor(5 * SAMPLE_RATE);
  const data = new Float32Array(len).fill(0.9);
  applyFade(data, SAMPLE_RATE, 2, 0);
  assert("fade-in starts at zero", Math.abs(data[0]) < 1e-6);
}

// Fade longer than buffer
{
  const len = Math.floor(0.5 * SAMPLE_RATE);
  const data = new Float32Array(len).fill(0.7);
  applyFade(data, SAMPLE_RATE, 0, 30);
  assert("long fade-out ends at zero", Math.abs(data[len - 1]) < 1e-6);
}

// Crossfade boundaries
for (const cf of [1, 2, 100, 132300]) {
  const a = 0.8;
  const b = -0.6;
  const start = mixCrossfadeSample(a, b, 0, cf);
  const end = mixCrossfadeSample(a, b, cf - 1, cf);
  if (cf === 1) {
    assert(`crossfade 1 midpoint`, Math.abs(start - clampSample(a * 0.5 + b * 0.5)) < 1e-5);
  } else {
    assert(`crossfade ${cf} start ~= a`, Math.abs(start - a) < 1e-5);
    assert(`crossfade ${cf} end ~= b`, Math.abs(end - b) < 1e-5);
  }
  assert(`crossfade ${cf} clamped`, Math.abs(start) <= 1 && Math.abs(end) <= 1);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll audio DSP checks passed.");
