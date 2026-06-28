// src/lib/guitar-tuner/noise.ts
var DEFAULT_NOISE_GATE_CONFIG = {
  rmsThreshold: 0.01,
  lowPassCutoffHz: 1e3,
  minClarityToAccept: 0.6
};
var DEFAULT_SMOOTHING_CONFIG = {
  centsSmoothingFactor: 0.3,
  uncertainSmoothingFactor: 0.15
};
function computeRms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}
function estimateSnrDb(signalRms, noiseFloor) {
  const floor = Math.max(noiseFloor, 1e-6);
  const ratio = Math.max(signalRms, floor) / floor;
  return 20 * Math.log10(ratio);
}

// src/lib/guitar-tuner/pitch/confidence.ts
function computeStability(recentFrequencies) {
  if (recentFrequencies.length < 2) return 0;
  const mean = recentFrequencies.reduce((a, b) => a + b, 0) / recentFrequencies.length;
  if (mean <= 0) return 0;
  const variance = recentFrequencies.reduce((sum, f) => sum + (f - mean) ** 2, 0) / recentFrequencies.length;
  const stdDevRatio = Math.sqrt(variance) / mean;
  return Math.min(Math.max(1 - stdDevRatio * 10, 0), 1);
}
function computeConfidence({ clarity, stability, snr }) {
  const normalizedSnr = Math.min(Math.max(snr / 30, 0), 1);
  const confidence = clarity * 0.5 + stability * 0.3 + normalizedSnr * 0.2;
  return Math.round(confidence * 100);
}

// src/lib/guitar-tuner/pitch/detector.ts
function selectAlgorithm(targetFrequencyRange) {
  const [min, max] = targetFrequencyRange;
  if (min < 1e3) {
    return { algorithm: "mpm", minFrequency: min, maxFrequency: max };
  }
  return { algorithm: "yin", minFrequency: min, maxFrequency: max };
}

// src/lib/guitar-tuner/pitch/mpm.ts
function parabolicInterpolation(y0, y1, y2) {
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return 0;
  return 0.5 * (y0 - y2) / denom;
}
function computeNsdf(buffer, maxLag) {
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
    nsdf[tau] = denom > 0 ? 2 * acf / denom : 0;
  }
  return nsdf;
}
function findPeaks(nsdf, minLag, maxLag) {
  const peaks = [];
  for (let i = minLag + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1] && nsdf[i] > 0) {
      peaks.push(i);
    }
  }
  return peaks;
}
function detectMpm(buffer, sampleRate2, minFrequency, maxFrequency) {
  const minLag = Math.floor(sampleRate2 / maxFrequency);
  const maxLag = Math.min(Math.ceil(sampleRate2 / minFrequency), buffer.length - 1);
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
    nsdf[bestLag + 1] ?? 0
  );
  const refinedLag = bestLag + offset;
  const frequency = refinedLag > 0 ? sampleRate2 / refinedLag : 0;
  return { frequency, clarity: Math.min(Math.max(bestClarity, 0), 1) };
}
function analyzeAlternativeOctave(buffer, sampleRate2, candidateFrequency, minFrequency, maxFrequency) {
  const half = candidateFrequency / 2;
  const double = candidateFrequency * 2;
  const candidates = [candidateFrequency];
  if (half >= minFrequency) candidates.push(half);
  if (double <= maxFrequency) candidates.push(double);
  let best = { frequency: candidateFrequency, clarity: 0 };
  for (const freq of candidates) {
    const expectedLag = sampleRate2 / freq;
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
      nsdf[localLag + 1] ?? 0
    );
    const refinedFreq = sampleRate2 / (localLag + offset);
    if (localBest > best.clarity) {
      best = { frequency: refinedFreq, clarity: localBest };
    }
  }
  return best;
}

// src/lib/guitar-tuner/pitch/notes.ts
var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function frequencyToNote(frequency, a4 = 440) {
  if (frequency <= 0 || !Number.isFinite(frequency)) {
    return { note: "\u2014", cents: 0 };
  }
  const semitonesFromA4 = 12 * Math.log2(frequency / a4);
  const roundedSemitones = Math.round(semitonesFromA4);
  const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100);
  const noteIndex = (roundedSemitones % 12 + 12 + 9) % 12;
  const octave = 4 + Math.floor((roundedSemitones + 9) / 12);
  const note = `${NOTE_NAMES[noteIndex]}${octave}`;
  return { note, cents };
}
function getMedianFrequency(readings) {
  if (readings.length === 0) return 0;
  const sorted = [...readings].map((r) => r.frequency).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function correctOctaveError(reading, recentReadings, buffer, sampleRate2, minFrequency, maxFrequency) {
  if (recentReadings.length < 3 || reading.frequency <= 0) return reading;
  const median = getMedianFrequency(recentReadings);
  if (median <= 0) return reading;
  const ratio = reading.frequency / median;
  const isLikelyOctaveUp = ratio > 1.9 && ratio < 2.1;
  const isLikelyOctaveDown = ratio > 0.45 && ratio < 0.55;
  if (!isLikelyOctaveUp && !isLikelyOctaveDown) return reading;
  const resolved = analyzeAlternativeOctave(
    buffer,
    sampleRate2,
    reading.frequency,
    minFrequency,
    maxFrequency
  );
  if (resolved.clarity < 0.6) return reading;
  const { note, cents } = frequencyToNote(resolved.frequency);
  return {
    ...reading,
    frequency: resolved.frequency,
    clarity: resolved.clarity,
    note,
    cents
  };
}
function smoothCents(current, previous, factor) {
  if (previous === null) return current;
  return factor * current + (1 - factor) * previous;
}

// src/lib/guitar-tuner/pitch/yin.ts
var YIN_THRESHOLD = 0.15;
function detectYin(buffer, sampleRate2, minFrequency, maxFrequency) {
  const minTau = Math.floor(sampleRate2 / maxFrequency);
  const maxTau = Math.min(Math.ceil(sampleRate2 / minFrequency), buffer.length - 1);
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
    yinBuffer[tau] = runningSum > 0 ? sum * tau / runningSum : 1;
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
    yinBuffer[bestTau + 1] ?? 1
  );
  const refinedTau = bestTau + offset;
  const frequency = sampleRate2 / refinedTau;
  const clarity = Math.min(Math.max(1 - yinBuffer[bestTau], 0), 1);
  return { frequency, clarity };
}

// src/lib/guitar-tuner/pitch/pipeline.ts
var RECENT_MAX = 5;
var PitchPipeline = class {
  constructor(config) {
    this.recentReadings = [];
    this.recentFrequencies = [];
    this.smoothedCents = null;
    this.noiseFloor = 1e-3;
    this.config = config;
  }
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  process(buffer, sampleRate2) {
    const rms = computeRms(buffer);
    const threshold = this.config.rmsThreshold ?? DEFAULT_NOISE_GATE_CONFIG.rmsThreshold;
    if (rms < threshold) {
      this.noiseFloor = Math.min(this.noiseFloor * 0.99 + rms * 0.01, threshold);
      return null;
    }
    const algo = this.config.algorithm ?? selectAlgorithm([this.config.minFrequency, this.config.maxFrequency]).algorithm;
    let result;
    if (algo === "yin") {
      result = detectYin(buffer, sampleRate2, this.config.minFrequency, this.config.maxFrequency);
    } else {
      result = detectMpm(buffer, sampleRate2, this.config.minFrequency, this.config.maxFrequency);
    }
    if (result.frequency <= 0 || result.clarity < DEFAULT_NOISE_GATE_CONFIG.minClarityToAccept) {
      return null;
    }
    const a4 = 440 * Math.pow(2, (this.config.a4CalibrationCents ?? 0) / 1200);
    let reading = {
      frequency: result.frequency,
      clarity: result.clarity,
      timestamp: Date.now(),
      ...frequencyToNote(result.frequency, a4),
      confidence: 0,
      rms,
      snr: estimateSnrDb(rms, this.noiseFloor)
    };
    reading = correctOctaveError(
      reading,
      this.recentReadings,
      buffer,
      sampleRate2,
      this.config.minFrequency,
      this.config.maxFrequency
    );
    this.recentFrequencies.push(reading.frequency);
    if (this.recentFrequencies.length > RECENT_MAX) this.recentFrequencies.shift();
    const stability = computeStability(this.recentFrequencies);
    reading.confidence = computeConfidence({
      clarity: reading.clarity,
      stability,
      snr: reading.snr
    });
    const factor = this.config.smoothingFactor ?? (reading.confidence >= 70 ? DEFAULT_SMOOTHING_CONFIG.centsSmoothingFactor : DEFAULT_SMOOTHING_CONFIG.uncertainSmoothingFactor);
    reading.cents = Math.round(smoothCents(reading.cents, this.smoothedCents, factor));
    this.smoothedCents = reading.cents;
    this.recentReadings.push(reading);
    if (this.recentReadings.length > RECENT_MAX) this.recentReadings.shift();
    return reading;
  }
  reset() {
    this.recentReadings = [];
    this.recentFrequencies = [];
    this.smoothedCents = null;
  }
};

// src/lib/guitar-tuner/worklet/pitch-processor.ts
var PitchProcessor = class extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferIndex = 0;
    this.hopSize = 1024;
    this.lastPostTime = 0;
    this.analysisIntervalMs = 50;
    this.stableSince = 0;
    this.lastStableNote = "";
    const bufferSize = options?.processorOptions?.bufferSize ?? 4096;
    this.buffer = new Float32Array(bufferSize);
    this.hopSize = Math.floor(bufferSize / 4);
    this.pipeline = new PitchPipeline({
      minFrequency: 65,
      maxFrequency: 450,
      algorithm: "mpm"
    });
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type !== "config") return;
      if (msg.bufferSize !== this.buffer.length) {
        this.buffer = new Float32Array(msg.bufferSize);
        this.bufferIndex = 0;
        this.hopSize = Math.floor(msg.bufferSize / 4);
      }
      this.analysisIntervalMs = msg.analysisIntervalMs;
      this.pipeline.updateConfig({
        minFrequency: msg.minFrequency,
        maxFrequency: msg.maxFrequency,
        algorithm: msg.algorithm,
        a4CalibrationCents: msg.a4CalibrationCents
      });
      this.pipeline.reset();
    };
  }
  accumulate(input) {
    for (let i = 0; i < input.length; i++) {
      if (this.bufferIndex >= this.buffer.length) {
        this.analyze();
        this.advanceWithOverlap();
      }
      this.buffer[this.bufferIndex++] = input[i];
    }
  }
  advanceWithOverlap() {
    const keep = this.buffer.length - this.hopSize;
    if (keep > 0) {
      this.buffer.copyWithin(0, this.hopSize, this.buffer.length);
    }
    this.bufferIndex = keep;
  }
  analyze() {
    const now = currentTime * 1e3;
    const interval = this.getEffectiveInterval(now);
    if (now - this.lastPostTime < interval) return;
    const reading = this.pipeline.process(this.buffer, sampleRate);
    if (!reading) return;
    this.lastPostTime = now;
    const msg = {
      type: "pitch",
      frequency: reading.frequency,
      clarity: reading.clarity,
      note: reading.note,
      cents: reading.cents,
      confidence: reading.confidence,
      rms: reading.rms,
      snr: reading.snr
    };
    this.port.postMessage(msg);
    if (reading.note === this.lastStableNote && reading.confidence >= 70) {
      if (this.stableSince === 0) this.stableSince = now;
    } else {
      this.stableSince = 0;
      this.lastStableNote = reading.note;
    }
  }
  getEffectiveInterval(now) {
    if (this.stableSince > 0 && now - this.stableSince >= 3e3) {
      return 200;
    }
    return this.analysisIntervalMs;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    this.accumulate(input);
    return true;
  }
};
registerProcessor("pitch-processor", PitchProcessor);
