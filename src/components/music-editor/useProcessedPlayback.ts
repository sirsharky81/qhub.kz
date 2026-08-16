"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { processSingleTrack, processProgramOutput } from "@/lib/music-editor/program";
import { settingsFingerprint } from "@/lib/music-editor/history";
import { getTrackIndexById } from "@/lib/music-editor/history";
import { mapResumeResultTime } from "@/lib/music-editor/selection";
import type { ActiveObject, AudioTrack, ManualEditSettings, ProgramTransition } from "@/lib/music-editor/types";
import { DEFAULT_MANUAL_SETTINGS } from "@/lib/music-editor/types";

interface ProcessedPlaybackPlayer {
  load: (buffer: AudioBuffer, opts?: { resetTime?: boolean }) => void;
  play: (from?: number) => void;
  seek?: (time: number) => void;
  isPlaying: boolean;
  currentTime: number;
  currentTimeRef: RefObject<number>;
  wantPlayingRef: RefObject<boolean>;
  duration?: number;
}

interface AppliedPlayback {
  mode: "track" | "program";
  settings: ManualEditSettings;
  sourceDuration: number;
  resultDuration: number;
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
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const lastFingerprint = useRef("");
  const appliedRef = useRef<AppliedPlayback | null>(null);
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

    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        setIsRendering(true);

        try {
          let buffer: AudioBuffer;
          let nextApplied: AppliedPlayback;

          if (activeObject.type === "program") {
            buffer = await processProgramOutput(
              tracks,
              manualSettings,
              programTrackIds,
              transitions,
              programSettings,
            );
            if (!cancelled) setProgramDuration(buffer.duration);
            nextApplied = {
              mode: "program",
              settings: programSettings,
              sourceDuration: buffer.duration,
              resultDuration: buffer.duration,
            };
          } else {
            const idx = getTrackIndexById(tracks, activeObject.trackId);
            const track = idx >= 0 ? tracks[idx] : tracks[0];
            const settings =
              idx >= 0 ? (manualSettings[idx] ?? DEFAULT_MANUAL_SETTINGS) : DEFAULT_MANUAL_SETTINGS;
            buffer = await processSingleTrack(track.buffer, settings);
            nextApplied = {
              mode: "track",
              settings,
              sourceDuration: track.duration,
              resultDuration: buffer.duration,
            };
          }

          if (cancelled) return;

          const p = playerRef.current;
          const want = p.wantPlayingRef.current;
          const resultTime = p.currentTimeRef.current;
          const prev = appliedRef.current;
          let resumeAt = resultTime;

          if (nextApplied.mode === "track" && prev?.mode === "track") {
            resumeAt = mapResumeResultTime(
              resultTime,
              nextApplied.sourceDuration,
              prev.settings,
              nextApplied.settings,
            );
          } else if (nextApplied.mode === "program" && prev && prev.resultDuration > 0) {
            resumeAt = (resultTime / prev.resultDuration) * buffer.duration;
          }

          const clamped = Math.min(Math.max(0, resumeAt), Math.max(0, buffer.duration - 0.02));

          lastFingerprint.current = fingerprint;
          appliedRef.current = nextApplied;
          setResultDuration(buffer.duration);
          setProcessedBuffer(buffer);
          p.load(buffer, { resetTime: false });
          if (want) p.play(clamped);
          else p.seek?.(clamped);
        } finally {
          if (!cancelled) setIsRendering(false);
        }
      })();
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tracks, manualSettings, programTrackIds, transitions, programSettings, activeObject, enabled]);

  return { resultDuration, programDuration, isRendering, processedBuffer };
}
