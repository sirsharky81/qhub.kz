import type { PitchDetectResult } from "./engine";
import { parabolicInterpolation } from "./mpm";

const YIN_THRESHOLD = 0.15;

export function detectYin(
  buffer: Float32Array,
  sampleRate: number,
  minFrequency: number,
  maxFrequency: number,
): PitchDetectResult {
  const minTau = Math.floor(sampleRate / maxFrequency);
  const maxTau = Math.min(Math.ceil(sampleRate / minFrequency), buffer.length - 1);

  if (maxTau <= minTau + 2) {
    return { frequency: 0, clarity: 0 };
  }

  const yinBuffer = new Float32Array(maxTau + 1);
  yinBuffer[0] = 1;

  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < buffer.length - tau; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    yinBuffer[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }

  let bestTau = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yinBuffer[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  if (bestTau < 0) {
    let minVal = Infinity;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        bestTau = tau;
      }
    }
  }

  if (bestTau <= 0) {
    return { frequency: 0, clarity: 0 };
  }

  const offset = parabolicInterpolation(
    yinBuffer[bestTau - 1] ?? 1,
    yinBuffer[bestTau],
    yinBuffer[bestTau + 1] ?? 1,
  );
  const refinedTau = bestTau + offset;
  const frequency = sampleRate / refinedTau;
  const clarity = Math.min(Math.max(1 - yinBuffer[bestTau], 0), 1);

  return { frequency, clarity };
}
