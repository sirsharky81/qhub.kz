import type { ManualEditSettings, ProgramTransition } from "./types";

export interface EditorState {
  tracks: import("./types").AudioTrack[];
  manualSettings: ManualEditSettings[];
  programTrackIds: string[];
  transitions: ProgramTransition[];
  /** Final trim/fade/volume on the merged program. */
  programSettings: ManualEditSettings;
  activeObject: import("./types").ActiveObject;
  /** Track shown in the editor panel (persists when program is active). */
  viewTrackId: string;
}

export function cloneManualSettings(settings: ManualEditSettings[]): ManualEditSettings[] {
  return settings.map((s) => ({
    ...s,
    cutRegions: s.cutRegions.map((c) => ({ ...c })),
  }));
}

export function cloneTransitions(transitions: ProgramTransition[]): ProgramTransition[] {
  return transitions.map((t) => ({ ...t }));
}

export function cloneEditorState(state: EditorState): EditorState {
  return {
    tracks: state.tracks,
    manualSettings: cloneManualSettings(state.manualSettings),
    programTrackIds: [...state.programTrackIds],
    transitions: cloneTransitions(state.transitions),
    programSettings: { ...state.programSettings, cutRegions: [] },
    activeObject: { ...state.activeObject },
    viewTrackId: state.viewTrackId,
  };
}

export function settingsFingerprint(
  tracks: EditorState["tracks"],
  settings: ManualEditSettings[],
  programTrackIds: string[],
  transitions: ProgramTransition[],
  programSettings: ManualEditSettings,
  activeObject: EditorState["activeObject"],
): string {
  return JSON.stringify({
    ids: tracks.map((t) => t.id),
    settings: settings.map((s) => ({
      trimStart: s.trimStart,
      trimEnd: s.trimEnd,
      cutRegions: s.cutRegions,
      volume: s.volume,
      fadeIn: s.fadeIn,
      fadeOut: s.fadeOut,
    })),
    programTrackIds,
    transitions,
    programSettings: {
      trimStart: programSettings.trimStart,
      trimEnd: programSettings.trimEnd,
      volume: programSettings.volume,
      fadeIn: programSettings.fadeIn,
      fadeOut: programSettings.fadeOut,
    },
    activeObject,
  });
}

export function getTrackIndexById(tracks: EditorState["tracks"], trackId: string): number {
  return tracks.findIndex((t) => t.id === trackId);
}

export function sanitizeExportName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "music";
}
