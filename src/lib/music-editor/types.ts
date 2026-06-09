export type ExportFormat = "mp3-320" | "mp3-192" | "wav";

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  size: number;
  buffer: AudioBuffer;
  peaks: number[];
}

export interface TrimRegion {
  start: number;
  end: number;
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

export const DEFAULT_MANUAL_SETTINGS: ManualEditSettings = {
  trimStart: 0,
  trimEnd: null,
  cutRegions: [],
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  crossfade: 0,
};

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
