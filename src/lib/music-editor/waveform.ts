export interface PeakMinMax {
  min: number;
  max: number;
}

function sampleRange(
  channel: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
): { startSample: number; endSample: number } {
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(channel.length, Math.ceil(endSec * sampleRate));
  return { startSample, endSample: Math.max(startSample + 1, endSample) };
}

export function computePeaks(buffer: AudioBuffer, barCount = 800): number[] {
  const channel = buffer.getChannelData(0);
  const { startSample, endSample } = sampleRange(channel, buffer.sampleRate, 0, buffer.duration);
  const rangeLen = endSample - startSample;
  const samplesPerBar = Math.max(1, Math.floor(rangeLen / barCount));
  const peaks: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = startSample + i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, endSample);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  const globalMax = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / globalMax);
}

/** Detailed peaks for a visible time range (LOD). */
export function computePeaksForRange(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  barCount: number,
): number[] {
  const channel = buffer.getChannelData(0);
  const { startSample, endSample } = sampleRange(channel, buffer.sampleRate, startSec, endSec);
  const rangeLen = endSample - startSample;
  const count = Math.max(1, barCount);
  const samplesPerBar = Math.max(1, Math.floor(rangeLen / count));
  const peaks: number[] = [];

  for (let i = 0; i < count; i++) {
    const start = startSample + i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, endSample);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  const globalMax = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / globalMax);
}

/** Min/max peaks for mirrored waveform display at high zoom. */
export function computePeaksMinMaxForRange(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  barCount: number,
): PeakMinMax[] {
  const channel = buffer.getChannelData(0);
  const { startSample, endSample } = sampleRange(channel, buffer.sampleRate, startSec, endSec);
  const rangeLen = endSample - startSample;
  const count = Math.max(1, barCount);
  const samplesPerBar = Math.max(1, Math.floor(rangeLen / count));
  const peaks: PeakMinMax[] = [];
  let globalMax = 0.001;

  for (let i = 0; i < count; i++) {
    const start = startSample + i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, endSample);
    let min = 0;
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = channel[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    if (absMax > globalMax) globalMax = absMax;
    peaks.push({ min, max });
  }

  return peaks.map((p) => ({
    min: p.min / globalMax,
    max: p.max / globalMax,
  }));
}

const LOD_CACHE_MAX = 16;

export class PeaksLodCache {
  private entries: { key: string; peaks: PeakMinMax[] }[] = [];

  get(
    buffer: AudioBuffer,
    startSec: number,
    endSec: number,
    barCount: number,
  ): PeakMinMax[] {
    const key = `${startSec.toFixed(4)}:${endSec.toFixed(4)}:${barCount}`;
    const hit = this.entries.find((e) => e.key === key);
    if (hit) return hit.peaks;

    const peaks = computePeaksMinMaxForRange(buffer, startSec, endSec, barCount);
    this.entries.push({ key, peaks });
    if (this.entries.length > LOD_CACHE_MAX) {
      this.entries.shift();
    }
    return peaks;
  }

  clear() {
    this.entries = [];
  }
}

export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await ctx.close();
  }
}

export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}
