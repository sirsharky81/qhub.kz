export type ExportFormat = "mp3-320" | "mp3-192" | "wav";

export interface BeatGrid {
  bpm: number;
  /** Seconds of the first beat. */
  offset: number;
  confidence: number;
}

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  size: number;
  buffer: AudioBuffer;
  peaks: number[];
  beatGrid?: BeatGrid | null;
}

export interface TrimRegion {
  start: number;
  end: number;
}

export interface EqSettings {
  bass: number;
  low: number;
  mid: number;
  high: number;
  air: number;
}

/** Sound edits for a source-time range. Absolute values; they replace globals on that range. */
export interface EditRegion {
  start: number;
  end: number;
  playbackRate: number;
  volume: number;
  eq: EqSettings;
}

export interface ManualEditSettings {
  trimStart: number;
  /** null = keep until end of track */
  trimEnd: number | null;
  cutRegions: TrimRegion[];
  volume: number;
  fadeIn: number;
  fadeOut: number;
  crossfade: number;
  /** Global tempo. 1 = original. Faster = shorter. */
  playbackRate: number;
  eq: EqSettings;
  editRegions: EditRegion[];
}

export type TransitionType = "none" | "crossfade";

export interface ProgramTransition {
  type: TransitionType;
  duration: number;
}

export type ActiveObject =
  | { type: "track"; trackId: string }
  | { type: "program" };

export interface ProgramTimelineSegment {
  trackId: string;
  trackName: string;
  programStart: number;
  programEnd: number;
  duration: number;
  colorIndex: number;
}

export interface ProgramTimelineTransition {
  index: number;
  programStart: number;
  programEnd: number;
  type: TransitionType;
  duration: number;
}

export interface ProgramTimeline {
  segments: ProgramTimelineSegment[];
  transitions: ProgramTimelineTransition[];
  totalDuration: number;
}

export const ACCEPTED_FORMATS = ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4";
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_TRACKS = 10;

export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 2;
export const PLAYBACK_RATE_PRESETS = [0.75, 0.9, 1, 1.1, 1.25] as const;
export const DEFAULT_SOURCE_BPM = 120;
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

export const FLAT_EQ: EqSettings = {
  bass: 0,
  low: 0,
  mid: 0,
  high: 0,
  air: 0,
};

export function cloneEq(eq: EqSettings = FLAT_EQ): EqSettings {
  return { bass: eq.bass, low: eq.low, mid: eq.mid, high: eq.high, air: eq.air };
}

export function isFlatEq(eq: EqSettings | undefined | null): boolean {
  if (!eq) return true;
  return eq.bass === 0 && eq.low === 0 && eq.mid === 0 && eq.high === 0 && eq.air === 0;
}

export function eqEquals(a: EqSettings, b: EqSettings): boolean {
  return a.bass === b.bass && a.low === b.low && a.mid === b.mid && a.high === b.high && a.air === b.air;
}

export function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate));
}

export function playbackRateFromBpm(sourceBpm: number, targetBpm: number): number {
  if (!(sourceBpm > 0) || !Number.isFinite(targetBpm) || targetBpm <= 0) return 1;
  return clampPlaybackRate(targetBpm / sourceBpm);
}

export function bpmFromPlaybackRate(sourceBpm: number, rate: number): number {
  if (!(sourceBpm > 0)) return 0;
  return sourceBpm * clampPlaybackRate(rate);
}

export function clampEqGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, db));
}

export function createManualSettings(): ManualEditSettings {
  return {
    trimStart: 0,
    trimEnd: null,
    cutRegions: [],
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    crossfade: 0,
    playbackRate: 1,
    eq: cloneEq(FLAT_EQ),
    editRegions: [],
  };
}

export const DEFAULT_MANUAL_SETTINGS: ManualEditSettings = createManualSettings();

export const DEFAULT_PROGRAM_TRANSITION: ProgramTransition = {
  type: "crossfade",
  duration: 3,
};

export const PROGRAM_SEGMENT_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", wave: "#3b82f6", label: "#1d4ed8" },
  { bg: "rgba(34, 197, 94, 0.15)", wave: "#22c55e", label: "#15803d" },
  { bg: "rgba(249, 115, 22, 0.15)", wave: "#f97316", label: "#c2410c" },
  { bg: "rgba(168, 85, 247, 0.15)", wave: "#a855f7", label: "#7e22ce" },
  { bg: "rgba(236, 72, 153, 0.15)", wave: "#ec4899", label: "#be185d" },
  { bg: "rgba(14, 165, 233, 0.15)", wave: "#0ea5e9", label: "#0369a1" },
  { bg: "rgba(234, 179, 8, 0.15)", wave: "#eab308", label: "#a16207" },
  { bg: "rgba(239, 68, 68, 0.15)", wave: "#ef4444", label: "#b91c1c" },
];
