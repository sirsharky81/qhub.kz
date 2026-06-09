const WINDOW_SEC = 0.5;

export interface EnergyWindow {
  start: number;
  end: number;
  energy: number;
}

export interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

export interface CutCandidate {
  time: number;
  score: number;
  reason: string;
}

export function computeEnergyWindows(buffer: AudioBuffer, windowSec = WINDOW_SEC): EnergyWindow[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSamples = Math.floor(windowSec * sampleRate);
  const windows: EnergyWindow[] = [];

  for (let i = 0; i < data.length; i += windowSamples) {
    const end = Math.min(i + windowSamples, data.length);
    let sum = 0;
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    windows.push({
      start: i / sampleRate,
      end: end / sampleRate,
      energy: Math.sqrt(sum / (end - i)),
    });
  }

  return windows;
}

export function findSilenceRegions(
  windows: EnergyWindow[],
  threshold = 0.02,
  minDuration = 1.5,
): SilenceRegion[] {
  const regions: SilenceRegion[] = [];
  let regionStart: number | null = null;

  for (const w of windows) {
    if (w.energy < threshold) {
      if (regionStart === null) regionStart = w.start;
    } else if (regionStart !== null) {
      const duration = w.start - regionStart;
      if (duration >= minDuration) {
        regions.push({ start: regionStart, end: w.start, duration });
      }
      regionStart = null;
    }
  }

  if (regionStart !== null) {
    const last = windows[windows.length - 1];
    const duration = last.end - regionStart;
    if (duration >= minDuration) {
      regions.push({ start: regionStart, end: last.end, duration });
    }
  }

  return regions.sort((a, b) => b.duration - a.duration);
}

export function findRepetitiveRegions(
  windows: EnergyWindow[],
  minSegmentSec = 8,
  similarityThreshold = 0.85,
): { start: number; end: number; similarTo: number }[] {
  const results: { start: number; end: number; similarTo: number }[] = [];
  const segWindows = Math.max(2, Math.floor(minSegmentSec / WINDOW_SEC));

  for (let i = 0; i < windows.length - segWindows; i++) {
    const segA = windows.slice(i, i + segWindows);
    for (let j = i + segWindows; j < windows.length - segWindows; j++) {
      const segB = windows.slice(j, j + segWindows);
      const sim = segmentSimilarity(segA, segB);
      if (sim >= similarityThreshold) {
        results.push({
          start: segB[0].start,
          end: segB[segB.length - 1].end,
          similarTo: segA[0].start,
        });
        break;
      }
    }
  }

  return results;
}

function segmentSimilarity(a: EnergyWindow[], b: EnergyWindow[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i].energy * b[i].energy;
    normA += a[i].energy ** 2;
    normB += b[i].energy ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findLowDiscontinuityCuts(
  windows: EnergyWindow[],
  topN = 20,
): CutCandidate[] {
  const candidates: CutCandidate[] = [];

  for (let i = 1; i < windows.length; i++) {
    const diff = Math.abs(windows[i].energy - windows[i - 1].energy);
    const avgEnergy = (windows[i].energy + windows[i - 1].energy) / 2;
    const score = diff / (avgEnergy + 0.001);
    candidates.push({
      time: windows[i].start,
      score,
      reason: "незаметный переход",
    });
  }

  return candidates.sort((a, b) => a.score - b.score).slice(0, topN);
}

export function getHighEnergyWindows(
  windows: EnergyWindow[],
  percentile = 0.75,
): EnergyWindow[] {
  const sorted = [...windows].sort((a, b) => a.energy - b.energy);
  const threshold = sorted[Math.floor(sorted.length * percentile)]?.energy ?? 0;
  return windows.filter((w) => w.energy >= threshold);
}

export function windowsToSegments(
  windows: EnergyWindow[],
  keepMask: boolean[],
): { start: number; end: number }[] {
  const segments: { start: number; end: number }[] = [];
  let segStart: number | null = null;

  for (let i = 0; i < windows.length; i++) {
    if (keepMask[i]) {
      if (segStart === null) segStart = windows[i].start;
    } else if (segStart !== null) {
      segments.push({ start: segStart, end: windows[i - 1].end });
      segStart = null;
    }
  }

  if (segStart !== null) {
    segments.push({ start: segStart, end: windows[windows.length - 1].end });
  }

  return segments;
}
