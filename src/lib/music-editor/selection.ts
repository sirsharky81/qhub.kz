import type { ManualEditSettings, TrimRegion } from "./types";

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

export function computeResultDuration(
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getKeepSegments(
    duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** Map playback time (processed) → position on original waveform. */
export function mapResultTimeToSource(
  resultTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getKeepSegments(
    duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );
  if (segments.length === 0) return 0;

  let elapsed = 0;
  for (const seg of segments) {
    const len = seg.end - seg.start;
    if (resultTime <= elapsed + len + 0.001) {
      return seg.start + Math.max(0, resultTime - elapsed);
    }
    elapsed += len;
  }
  return segments[segments.length - 1].end;
}

/** Map click on waveform (source time) → playback seek position. */
export function mapSourceTimeToResult(
  sourceTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  const segments = getKeepSegments(
    duration,
    settings.trimStart,
    settings.trimEnd,
    settings.cutRegions,
  );
  if (segments.length === 0) return 0;

  let elapsed = 0;
  for (const seg of segments) {
    if (sourceTime < seg.start) return elapsed;
    if (sourceTime <= seg.end) return elapsed + (sourceTime - seg.start);
    elapsed += seg.end - seg.start;
  }
  return elapsed;
}

/** Source time at playhead for «Начало здесь» / «Конец здесь». */
export function getPlayheadSourceTime(
  resultTime: number,
  duration: number,
  settings: ManualEditSettings,
): number {
  return mapResultTimeToSource(resultTime, duration, settings);
}
