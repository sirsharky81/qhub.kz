import type {
  AudioTrack,
  ManualEditSettings,
  ProgramTimeline,
  ProgramTransition,
} from "./types";
import { computeResultDuration } from "./selection";
import { getKeepSegments } from "./process";
import { applyFade, clampBuffer, mixCrossfadeSample } from "./audio-dsp";

function effectiveCrossfadeSamples(
  prevChunk: Float32Array,
  nextChunk: Float32Array,
  transition: ProgramTransition | undefined,
  sampleRate: number,
): number {
  if (!transition || transition.type !== "crossfade" || transition.duration <= 0) return 0;
  const requested = Math.floor(transition.duration * sampleRate);
  if (requested <= 0) return 0;
  return Math.min(requested, prevChunk.length, nextChunk.length);
}

function effectiveCrossfadeSec(
  prevDuration: number,
  nextDuration: number,
  transition: ProgramTransition | undefined,
): number {
  if (!transition || transition.type !== "crossfade" || transition.duration <= 0) return 0;
  return Math.min(transition.duration, prevDuration, nextDuration);
}

export function processTrackToChunk(
  buffer: AudioBuffer,
  settings: ManualEditSettings,
): Float32Array {
  const sampleRate = buffer.sampleRate;
  const segments = getKeepSegments(
    buffer.duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );

  if (segments.length === 0) return new Float32Array(0);

  let totalSamples = 0;
  const parts: Float32Array[] = [];

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const startSample = Math.floor(seg.start * sampleRate);
    const endSample = Math.floor(seg.end * sampleRate);
    const length = endSample - startSample;
    if (length <= 0) continue;

    const chunk = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      chunk[i] = ((ch0[startSample + i] + ch1[startSample + i]) / 2) * settings.volume;
    }

    const isFirst = s === 0;
    const isLast = s === segments.length - 1;
    applyFade(
      chunk,
      sampleRate,
      isFirst ? settings.fadeIn : 0,
      isLast ? settings.fadeOut : 0,
    );
    clampBuffer(chunk);
    parts.push(chunk);
    totalSamples += length;
  }

  if (totalSamples === 0) return new Float32Array(0);

  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  clampBuffer(merged);
  return merged;
}

function chunksToBuffer(chunks: Float32Array[], sampleRate: number): AudioBuffer {
  if (chunks.length === 0 || chunks[0].length === 0) {
    const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * 0.1), sampleRate);
    return ctx.createBuffer(1, Math.floor(sampleRate * 0.1), sampleRate);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  const ctx = new OfflineAudioContext(1, output.length, sampleRate);
  const outBuffer = ctx.createBuffer(1, output.length, sampleRate);
  outBuffer.copyToChannel(new Float32Array(output), 0);
  return outBuffer;
}

function concatWithTransitions(
  chunks: Float32Array[],
  transitions: ProgramTransition[],
  sampleRate: number,
): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0];

  const crossfadeSizes: number[] = [];
  for (let i = 1; i < chunks.length; i++) {
    crossfadeSizes.push(
      effectiveCrossfadeSamples(chunks[i - 1], chunks[i], transitions[i - 1], sampleRate),
    );
  }

  let totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  for (const cf of crossfadeSizes) {
    totalLength -= cf;
  }
  totalLength = Math.max(1, totalLength);

  const output = new Float32Array(totalLength);
  let offset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (i === 0) {
      output.set(chunk, offset);
      offset += chunk.length;
      continue;
    }

    const crossfadeSamples = crossfadeSizes[i - 1];

    if (crossfadeSamples > 0) {
      const fadeStart = offset - crossfadeSamples;
      for (let j = 0; j < crossfadeSamples; j++) {
        const outIdx = fadeStart + j;
        if (outIdx < 0 || outIdx >= output.length) continue;
        const chunkIdx = j;
        if (chunkIdx >= chunk.length) continue;
        output[outIdx] = mixCrossfadeSample(output[outIdx], chunk[chunkIdx], j, crossfadeSamples);
      }
      const remaining = chunk.slice(crossfadeSamples);
      if (remaining.length > 0) {
        output.set(remaining, offset);
        offset += remaining.length;
      }
    } else {
      output.set(chunk, offset);
      offset += chunk.length;
    }
  }

  const result = output.slice(0, offset);
  clampBuffer(result);
  return result;
}

export async function processSingleTrack(
  buffer: AudioBuffer,
  settings: ManualEditSettings,
): Promise<AudioBuffer> {
  const chunk = processTrackToChunk(buffer, settings);
  return chunksToBuffer([chunk], buffer.sampleRate);
}

export async function processProgramOutput(
  tracks: AudioTrack[],
  manualSettings: ManualEditSettings[],
  programTrackIds: string[],
  transitions: ProgramTransition[],
  programSettings: ManualEditSettings,
): Promise<AudioBuffer> {
  if (programTrackIds.length === 0) {
    return processProgram(tracks, manualSettings, programTrackIds, transitions);
  }

  const sampleRate = tracks[0]?.buffer.sampleRate ?? 44100;
  const chunks: Float32Array[] = [];

  for (const id of programTrackIds) {
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx < 0) continue;
    const settings = manualSettings[idx] ?? manualSettings[0];
    chunks.push(processTrackToChunk(tracks[idx].buffer, settings));
  }

  const alignedTransitions = transitions.slice(0, Math.max(0, chunks.length - 1));
  const merged = concatWithTransitions(chunks, alignedTransitions, sampleRate);
  if (merged.length === 0) {
    return processProgram(tracks, manualSettings, programTrackIds, transitions);
  }

  const mergedDuration = merged.length / sampleRate;
  const finalChunk = processPcmWithSettings(merged, sampleRate, mergedDuration, {
    ...programSettings,
    cutRegions: [],
  });
  return chunksToBuffer([finalChunk], sampleRate);
}

/** Apply trim / volume / fade on already-rendered mono PCM (program final pass). */
function processPcmWithSettings(
  pcm: Float32Array,
  sampleRate: number,
  sourceDuration: number,
  settings: ManualEditSettings,
): Float32Array {
  const segments = getKeepSegments(
    sourceDuration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );

  if (segments.length === 0) return new Float32Array(0);

  const parts: Float32Array[] = [];
  let totalSamples = 0;

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const startSample = Math.floor(seg.start * sampleRate);
    const endSample = Math.floor(seg.end * sampleRate);
    const length = endSample - startSample;
    if (length <= 0) continue;

    const chunk = pcm.slice(startSample, endSample);
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] *= settings.volume;
    }

    const isFirst = s === 0;
    const isLast = s === segments.length - 1;
    applyFade(
      chunk,
      sampleRate,
      isFirst ? settings.fadeIn : 0,
      isLast ? settings.fadeOut : 0,
    );
    clampBuffer(chunk);
    parts.push(chunk);
    totalSamples += chunk.length;
  }

  if (totalSamples === 0) return new Float32Array(0);

  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  clampBuffer(merged);
  return merged;
}

export async function processProgram(
  tracks: AudioTrack[],
  manualSettings: ManualEditSettings[],
  programTrackIds: string[],
  transitions: ProgramTransition[],
): Promise<AudioBuffer> {
  if (programTrackIds.length === 0) {
    const sampleRate = tracks[0]?.buffer.sampleRate ?? 44100;
    const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * 0.1), sampleRate);
    return ctx.createBuffer(1, Math.floor(sampleRate * 0.1), sampleRate);
  }

  const sampleRate = tracks[0]?.buffer.sampleRate ?? 44100;
  const chunks: Float32Array[] = [];

  for (const id of programTrackIds) {
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx < 0) continue;
    const settings = manualSettings[idx] ?? manualSettings[0];
    chunks.push(processTrackToChunk(tracks[idx].buffer, settings));
  }

  const alignedTransitions = transitions.slice(0, Math.max(0, chunks.length - 1));
  const output = concatWithTransitions(chunks, alignedTransitions, sampleRate);

  const ctx = new OfflineAudioContext(1, output.length, sampleRate);
  const outBuffer = ctx.createBuffer(1, output.length, sampleRate);
  outBuffer.copyToChannel(new Float32Array(output), 0);
  return outBuffer;
}

export function computeProgramTimeline(
  tracks: AudioTrack[],
  manualSettings: ManualEditSettings[],
  programTrackIds: string[],
  transitions: ProgramTransition[],
): ProgramTimeline {
  if (programTrackIds.length === 0) {
    return { segments: [], transitions: [], totalDuration: 0 };
  }

  const segments: ProgramTimeline["segments"] = [];
  const timelineTransitions: ProgramTimeline["transitions"] = [];
  let cursor = 0;

  for (let i = 0; i < programTrackIds.length; i++) {
    const trackId = programTrackIds[i];
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) continue;

    const track = tracks[idx];
    const settings = manualSettings[idx] ?? manualSettings[0];
    const duration = computeResultDuration(track.duration, settings);

    if (i > 0) {
      const prevTransition = transitions[i - 1];
      const prevDuration = segments[segments.length - 1]?.duration ?? duration;
      const overlap = effectiveCrossfadeSec(prevDuration, duration, prevTransition);
      if (overlap > 0) {
        const overlapStart = cursor - overlap;
        timelineTransitions.push({
          index: i - 1,
          programStart: Math.max(0, overlapStart),
          programEnd: cursor,
          type: "crossfade",
          duration: overlap,
        });
        cursor = overlapStart;
      }
    }

    const programStart = cursor;
    const programEnd = cursor + duration;

    segments.push({
      trackId,
      trackName: track.name,
      programStart,
      programEnd,
      duration,
      colorIndex: i % 8,
    });

    cursor = programEnd;
  }

  return {
    segments,
    transitions: timelineTransitions,
    totalDuration: cursor,
  };
}

export function getProcessedPeaksForTrack(
  peaks: number[],
  sourceDuration: number,
  settings: ManualEditSettings,
  targetCount = 200,
): number[] {
  if (peaks.length === 0 || sourceDuration <= 0) return [];

  const trimStart = settings.trimStart;
  const trimEnd = settings.trimEnd ?? sourceDuration;
  const startIdx = Math.floor((trimStart / sourceDuration) * peaks.length);
  const endIdx = Math.ceil((trimEnd / sourceDuration) * peaks.length);
  const sliced = peaks.slice(startIdx, Math.max(startIdx + 1, endIdx));

  if (sliced.length <= targetCount) return sliced;

  const result: number[] = [];
  const step = sliced.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const from = Math.floor(i * step);
    const to = Math.floor((i + 1) * step);
    let max = 0;
    for (let j = from; j < to && j < sliced.length; j++) {
      if (sliced[j] > max) max = sliced[j];
    }
    result.push(max);
  }
  return result;
}

/** Unified peaks for the merged program waveform. */
export function computeMergedProgramPeaks(
  timeline: ProgramTimeline,
  segmentPeaks: { trackId: string; peaks: number[] }[],
  targetCount = 320,
): number[] {
  const { segments, totalDuration } = timeline;
  if (totalDuration <= 0 || segments.length === 0) return [];

  const result = new Array<number>(targetCount).fill(0);

  for (const seg of segments) {
    const entry = segmentPeaks.find((p) => p.trackId === seg.trackId);
    const peaks = entry?.peaks ?? [];
    if (peaks.length === 0) continue;

    const startIdx = Math.floor((seg.programStart / totalDuration) * targetCount);
    const endIdx = Math.ceil((seg.programEnd / totalDuration) * targetCount);
    const span = Math.max(1, endIdx - startIdx);

    for (let i = 0; i < span; i++) {
      const peakIdx = Math.floor((i / span) * peaks.length);
      const globalIdx = startIdx + i;
      if (globalIdx >= 0 && globalIdx < targetCount) {
        result[globalIdx] = Math.max(result[globalIdx], peaks[peakIdx] ?? 0);
      }
    }
  }

  return result;
}

export function getTransitionPreviewRange(
  timeline: ProgramTimeline,
  transitionIndex: number,
): { start: number; end: number } | null {
  const t = timeline.transitions.find((x) => x.index === transitionIndex);
  if (!t) return null;
  return { start: t.programStart, end: t.programEnd };
}
