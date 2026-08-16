import type { EditRegion, EqSettings, ManualEditSettings, TrimRegion } from "./types";
import {
  clampPlaybackRate,
  cloneEq,
  FLAT_EQ,
  isFlatEq,
} from "./types";

export interface TimedSegment {
  start: number;
  end: number;
  rate: number;
  volume: number;
  eq: EqSettings;
}

export function effectiveTrimEnd(settings: ManualEditSettings, duration: number): number {
  return settings.trimEnd ?? duration;
}

export function hasTrimStart(settings: ManualEditSettings): boolean {
  return settings.trimStart > 0.01;
}

export function hasTrimEnd(settings: ManualEditSettings, duration: number): boolean {
  return settings.trimEnd !== null && settings.trimEnd < duration - 0.01;
}

export function getKeepSegments(
  duration: number,
  trimStart: number,
  trimEnd: number | null,
  cutRegions: TrimRegion[],
): { start: number; end: number }[] {
  const effectiveEnd = trimEnd ?? duration;
  const cuts = [...cutRegions]
    .filter((c) => c.start < effectiveEnd && c.end > trimStart)
    .sort((a, b) => a.start - b.start);

  const segments: { start: number; end: number }[] = [];
  let cursor = trimStart;

  for (const cut of cuts) {
    if (cut.start > cursor) {
      segments.push({ start: cursor, end: Math.min(cut.start, effectiveEnd) });
    }
    cursor = Math.max(cursor, cut.end);
  }

  if (cursor < effectiveEnd) {
    segments.push({ start: cursor, end: effectiveEnd });
  }

  return segments.filter((s) => s.end - s.start > 0.01);
}

export function getRemovedSegments(
  duration: number,
  trimStart: number,
  trimEnd: number | null,
  cutRegions: TrimRegion[],
): TrimRegion[] {
  const effectiveEnd = trimEnd ?? duration;
  const removed: TrimRegion[] = [];

  if (trimStart > 0) removed.push({ start: 0, end: trimStart });
  for (const cut of cutRegions) removed.push(cut);
  if (effectiveEnd < duration) removed.push({ start: effectiveEnd, end: duration });

  return removed.filter((s) => s.end - s.start > 0.01);
}

export function getTimedSegments(
  duration: number,
  settings: ManualEditSettings,
): TimedSegment[] {
  const keep = getKeepSegments(
    duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );
  if (keep.length === 0) return [];

  const globalRate = clampPlaybackRate(settings.playbackRate ?? 1);
  const globalVolume = Number.isFinite(settings.volume) ? settings.volume : 1;
  const globalEq = settings.eq ?? FLAT_EQ;
  const regions = settings.editRegions ?? [];

  const bounds = new Set<number>();
  for (const k of keep) {
    bounds.add(k.start);
    bounds.add(k.end);
  }
  for (const r of regions) {
    bounds.add(r.start);
    bounds.add(r.end);
  }

  const points = [...bounds].sort((a, b) => a - b);
  const result: TimedSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end - start < 0.01) continue;
    const mid = (start + end) / 2;
    if (!keep.some((k) => mid >= k.start && mid < k.end - 1e-9)) continue;
    const region = regions.find((r) => mid >= r.start && mid < r.end - 1e-9);
    result.push({
      start,
      end,
      rate: clampPlaybackRate(region?.playbackRate ?? globalRate),
      volume: region?.volume ?? globalVolume,
      eq: cloneEq(region?.eq ?? globalEq),
    });
  }

  return result;
}

export function computeResultDuration(
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getTimedSegments(duration, settings);
  return segments.reduce((sum, s) => sum + (s.end - s.start) / s.rate, 0);
}

/** Map playback time (processed) → position on original waveform. */
export function mapResultTimeToSource(
  resultTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getTimedSegments(duration, settings);
  if (segments.length === 0) return 0;

  let elapsed = 0;
  for (const seg of segments) {
    const outLen = (seg.end - seg.start) / seg.rate;
    if (resultTime <= elapsed + outLen + 0.001) {
      const into = Math.max(0, resultTime - elapsed);
      return seg.start + into * seg.rate;
    }
    elapsed += outLen;
  }
  return segments[segments.length - 1].end;
}

/** Keep the same place in the original track after speed/trim/EQ rebuild. */
export function mapResumeResultTime(
  resultTime: number,
  duration: number,
  oldSettings: ManualEditSettings,
  newSettings: ManualEditSettings,
): number {
  const source = mapResultTimeToSource(resultTime, duration, oldSettings);
  return mapSourceTimeToResult(source, duration, newSettings);
}

/** Map click on waveform (source time) → playback seek position. */
export function mapSourceTimeToResult(
  sourceTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getTimedSegments(duration, settings);
  if (segments.length === 0) return 0;

  let elapsed = 0;
  for (const seg of segments) {
    const outLen = (seg.end - seg.start) / seg.rate;
    if (sourceTime < seg.start) return elapsed;
    if (sourceTime <= seg.end) return elapsed + (sourceTime - seg.start) / seg.rate;
    elapsed += outLen;
  }
  return elapsed;
}

export function cloneEditRegion(region: EditRegion): EditRegion {
  return {
    start: region.start,
    end: region.end,
    playbackRate: region.playbackRate,
    volume: region.volume,
    eq: cloneEq(region.eq),
  };
}

export function upsertEditRegion(regions: EditRegion[], next: EditRegion): EditRegion[] {
  const pieces: EditRegion[] = [];
  for (const r of regions) {
    if (r.end <= next.start + 0.01 || r.start >= next.end - 0.01) {
      pieces.push(cloneEditRegion(r));
      continue;
    }
    if (r.start < next.start - 0.01) {
      pieces.push({ ...cloneEditRegion(r), end: next.start });
    }
    if (r.end > next.end + 0.01) {
      pieces.push({ ...cloneEditRegion(r), start: next.end });
    }
  }
  pieces.push(cloneEditRegion(next));
  return pieces
    .filter((r) => r.end - r.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

export function describeEditRegion(region: EditRegion): string {
  const parts: string[] = [];
  if (Math.abs(region.playbackRate - 1) > 0.001) {
    parts.push(`${region.playbackRate.toFixed(2)}×`);
  }
  if (Math.abs(region.volume - 1) > 0.01) {
    parts.push(`${Math.round(region.volume * 100)}%`);
  }
  if (!isFlatEq(region.eq)) parts.push("EQ");
  return parts.join(" · ") || "правка";
}

export function findRegionForLoop(
  regions: EditRegion[],
  loop: TrimRegion | null,
): EditRegion | null {
  if (!loop) return null;
  const exact = regions.find(
    (r) => Math.abs(r.start - loop.start) < 0.05 && Math.abs(r.end - loop.end) < 0.05,
  );
  if (exact) return exact;
  const mid = (loop.start + loop.end) / 2;
  return regions.find((r) => mid >= r.start && mid <= r.end) ?? null;
}

/** Source time at playhead for «Начало здесь» / «Конец здесь». */
export function getPlayheadSourceTime(
  resultTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  return mapResultTimeToSource(resultTime, duration, settings);
}

export function mergeCutRegions(cuts: TrimRegion[]): TrimRegion[] {
  if (cuts.length === 0) return [];
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const merged: TrimRegion[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 0.01) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/** Cut must lie fully inside one kept segment. */
export function isCutWithinKeep(
  cut: TrimRegion,
  duration: number,
  settings: ManualEditSettings,
): boolean {
  if (cut.end - cut.start < 0.05) return false;
  const segments = getKeepSegments(
    duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );
  return segments.some(
    (s) => cut.start >= s.start + 0.01 && cut.end <= s.end - 0.01,
  );
}

export function addCutRegion(
  duration: number,
  settings: ManualEditSettings,
  cut: TrimRegion,
): TrimRegion[] | null {
  if (!isCutWithinKeep(cut, duration, settings)) return null;
  return mergeCutRegions([...settings.cutRegions, cut]);
}
