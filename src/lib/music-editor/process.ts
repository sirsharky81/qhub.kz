import type { ManualEditSettings } from "./types";
import { getKeepSegments as getKeepSegmentsFromSelection } from "./selection";
import { applyFade, clampBuffer, mixCrossfadeSample } from "./audio-dsp";

export async function processManualEdit(
  buffers: AudioBuffer[],
  settings: ManualEditSettings[],
  crossfadeSec: number,
): Promise<AudioBuffer> {
  const sampleRate = buffers[0]?.sampleRate ?? 44100;
  const processedChunks: Float32Array[] = [];

  for (let t = 0; t < buffers.length; t++) {
    const buffer = buffers[t];
    const s = settings[t] ?? settings[0];
    const segments = getKeepSegmentsFromSelection(
      buffer.duration,
      s.trimStart,
      s.trimEnd,
      s.cutRegions,
    );

    for (const seg of segments) {
      const startSample = Math.floor(seg.start * sampleRate);
      const endSample = Math.floor(seg.end * sampleRate);
      const length = endSample - startSample;
      const chunk = new Float32Array(length);

      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

      for (let i = 0; i < length; i++) {
        chunk[i] = ((ch0[startSample + i] + ch1[startSample + i]) / 2) * s.volume;
      }

      applyFade(chunk, sampleRate, s.fadeIn, s.fadeOut);
      clampBuffer(chunk);
      processedChunks.push(chunk);
    }
  }

  if (processedChunks.length === 0) {
    return createSilentBuffer(sampleRate, 0.1);
  }

  const crossfadeSamples = Math.floor(crossfadeSec * sampleRate);
  let totalLength = processedChunks.reduce((sum, c) => sum + c.length, 0);
  if (processedChunks.length > 1 && crossfadeSamples > 0) {
    totalLength -= crossfadeSamples * (processedChunks.length - 1);
  }

  const output = new Float32Array(Math.max(1, totalLength));
  let offset = 0;

  for (let i = 0; i < processedChunks.length; i++) {
    const chunk = processedChunks[i];
    if (i === 0) {
      output.set(chunk, offset);
      offset += chunk.length;
    } else if (crossfadeSamples > 0) {
      const fadeStart = offset - crossfadeSamples;
      for (let j = 0; j < crossfadeSamples && fadeStart + j < output.length; j++) {
        const outIdx = fadeStart + j;
        const chunkIdx = j;
        if (chunkIdx < chunk.length) {
          output[outIdx] = mixCrossfadeSample(output[outIdx], chunk[chunkIdx], j, crossfadeSamples);
        }
      }
      const remaining = chunk.slice(crossfadeSamples);
      output.set(remaining, offset);
      offset += remaining.length;
    } else {
      output.set(chunk, offset);
      offset += chunk.length;
    }
  }

  clampBuffer(output);
  const ctx = new OfflineAudioContext(1, output.length, sampleRate);
  const outBuffer = ctx.createBuffer(1, output.length, sampleRate);
  outBuffer.copyToChannel(new Float32Array(output), 0);
  return outBuffer;
}

export async function mergeSegmentsToBuffer(
  source: AudioBuffer,
  segments: { start: number; end: number }[],
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  let totalSamples = 0;

  for (const seg of segments) {
    totalSamples += Math.floor((seg.end - seg.start) * sampleRate);
  }

  if (totalSamples === 0) return createSilentBuffer(sampleRate, 0.1);

  const ch0 = source.getChannelData(0);
  const ch1 = source.numberOfChannels > 1 ? source.getChannelData(1) : ch0;
  const ctx = new OfflineAudioContext(1, totalSamples, sampleRate);
  const output = ctx.createBuffer(1, totalSamples, sampleRate);
  const outData = output.getChannelData(0);

  let offset = 0;
  for (const seg of segments) {
    const start = Math.floor(seg.start * sampleRate);
    const end = Math.floor(seg.end * sampleRate);
    for (let i = start; i < end; i++) {
      outData[offset++] = (ch0[i] + ch1[i]) / 2;
    }
  }

  return output;
}

function createSilentBuffer(sampleRate: number, duration: number): AudioBuffer {
  const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * duration), sampleRate);
  return ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
}

export function bufferToMonoPreview(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer;
  const ctx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const out = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const mono = out.getChannelData(0);
  for (let i = 0; i < buffer.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) / 2;
  }
  return out;
}

export { getKeepSegmentsFromSelection as getKeepSegments };
