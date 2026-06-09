"use client";

import { useEffect, useRef, useState } from "react";
import { processSingleTrack, processProgramOutput } from "@/lib/music-editor/program";
import { settingsFingerprint } from "@/lib/music-editor/history";
import { getTrackIndexById } from "@/lib/music-editor/history";
import type { ActiveObject, AudioTrack, ManualEditSettings, ProgramTransition } from "@/lib/music-editor/types";
import { DEFAULT_MANUAL_SETTINGS } from "@/lib/music-editor/types";

interface ProcessedPlaybackPlayer {
  load: (buffer: AudioBuffer) => void;
  stop: () => void;
  isPlaying: boolean;
}

export function useProcessedPlayback(
  tracks: AudioTrack[],
  manualSettings: ManualEditSettings[],
  programTrackIds: string[],
  transitions: ProgramTransition[],
  programSettings: ManualEditSettings,
  activeObject: ActiveObject,
  player: ProcessedPlaybackPlayer,
  enabled: boolean,
) {
  const [resultDuration, setResultDuration] = useState(0);
  const [programDuration, setProgramDuration] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const lastFingerprint = useRef("");
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    if (!enabled || tracks.length === 0) return;

    const fingerprint = settingsFingerprint(
      tracks,
      manualSettings,
      programTrackIds,
      transitions,
      programSettings,
      activeObject,
    );
    if (fingerprint === lastFingerprint.current) return;

    let cancelled = false;
    playerRef.current.stop();

    setIsRendering(true);
    (async () => {
      try {
        let buffer: AudioBuffer;

        if (activeObject.type === "program") {
          buffer = await processProgramOutput(
            tracks,
            manualSettings,
            programTrackIds,
            transitions,
            programSettings,
          );
          if (!cancelled) setProgramDuration(buffer.duration);
        } else {
          const idx = getTrackIndexById(tracks, activeObject.trackId);
          const track = idx >= 0 ? tracks[idx] : tracks[0];
          const settings = idx >= 0 ? (manualSettings[idx] ?? DEFAULT_MANUAL_SETTINGS) : DEFAULT_MANUAL_SETTINGS;
          buffer = await processSingleTrack(track.buffer, settings);
        }

        if (cancelled) return;
        lastFingerprint.current = fingerprint;
        setResultDuration(buffer.duration);
        playerRef.current.load(buffer);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tracks, manualSettings, programTrackIds, transitions, programSettings, activeObject, enabled]);

  return { resultDuration, programDuration, isRendering };
}
