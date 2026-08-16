"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { WaveformEditor } from "./WaveformEditor";
import { PlaybackControls } from "./AudioPlayer";
import { CutPreviewBar } from "./CutPreviewBar";
import { ExportPanel } from "./ExportPanel";
import { HistoryToolbar } from "./HistoryToolbar";
import { ProgramPanel } from "./ProgramPanel";
import { TimeField, SecondsField } from "./EditorInputs";
import { SoundEditPanel } from "./SoundEditPanel";
import { processSingleTrack } from "@/lib/music-editor/program";
import { detectBeatGrid } from "@/lib/music-editor/beat-analysis";
import {
  formatTimePrecise,
  formatTimeMs,
  parseTimePrecise,
  parseTimeMs,
  clampTime,
  snapToBeat as snapToBeatFn,
} from "@/lib/music-editor/format";
import {
  computeResultDuration,
  effectiveTrimEnd,
  hasTrimStart,
  hasTrimEnd,
  mapResultTimeToSource,
  mapSourceTimeToResult,
  getPlayheadSourceTime,
  addCutRegion,
  isCutWithinKeep,
  settingsWithPendingCut,
} from "@/lib/music-editor/selection";
import type {
  ActiveObject,
  AudioTrack,
  BeatGrid,
  ExportFormat,
  ManualEditSettings,
  ProgramTransition,
  TrimRegion,
} from "@/lib/music-editor/types";
import { cloneEq, DEFAULT_SOURCE_BPM, FLAT_EQ } from "@/lib/music-editor/types";

interface PlayerApi {
  isPlaying: boolean;
  currentTime: number;
  currentTimeRef: RefObject<number>;
  duration: number;
  play: (from?: number) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  skip: (delta: number) => void;
  setLoop: (region: { start: number; end: number } | null, enabled: boolean) => void;
  load: (buffer: AudioBuffer, opts?: { resetTime?: boolean }) => void;
  unlock: () => void;
  wantPlayingRef: RefObject<boolean>;
}

interface ManualEditorPanelProps {
  track: AudioTrack;
  tracks: AudioTrack[];
  manualSettings: ManualEditSettings[];
  settings: ManualEditSettings;
  programTrackIds: string[];
  transitions: ProgramTransition[];
  programSettings: ManualEditSettings;
  activeObject: ActiveObject;
  exportFormat: ExportFormat;
  exporting: boolean;
  isRendering: boolean;
  resultDuration: number;
  programDuration: number;
  processedBuffer: AudioBuffer | null;
  player: PlayerApi;
  canUndo: boolean;
  canRedo: boolean;
  exportFilename: string;
  saveTargetLabel: string;
  exportDisabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  onSettingsChange: (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => void;
  onProgramSettingsChange: (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => void;
  onActivateTrack: () => void;
  onActivateProgram: () => void;
  onProgramReorder: (ids: string[]) => void;
  onTransitionChange: (index: number, transition: ProgramTransition) => void;
  onRemoveFromProgram: (trackId: string) => void;
  onExportFormatChange: (format: ExportFormat) => void;
  onExport: () => void;
  onBeatGridChange: (trackId: string, beatGrid: BeatGrid | null) => void;
}

const inputClass =
  "w-full px-2 py-1 font-mono text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/5";

const btnClass =
  "px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap";

const sectionLabel =
  "text-[10px] font-semibold text-gray-500 uppercase tracking-wider";

const cardClass = "bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-2";

const inactiveClass = "opacity-50 pointer-events-none";

export function ManualEditorPanel({
  track,
  tracks,
  manualSettings,
  settings,
  programTrackIds,
  transitions,
  programSettings,
  activeObject,
  exportFormat,
  exporting,
  isRendering,
  resultDuration,
  programDuration,
  processedBuffer,
  player,
  canUndo,
  canRedo,
  exportFilename,
  saveTargetLabel,
  exportDisabled,
  onUndo,
  onRedo,
  onBeginGesture,
  onEndGesture,
  onSettingsChange,
  onProgramSettingsChange,
  onActivateTrack,
  onActivateProgram,
  onProgramReorder,
  onTransitionChange,
  onRemoveFromProgram,
  onExportFormatChange,
  onExport,
  onBeatGridChange,
}: ManualEditorPanelProps) {
  const waveSectionRef = useRef<HTMLDivElement>(null);
  const setLoopRef = useRef(player.setLoop);
  setLoopRef.current = player.setLoop;
  const playerRef = useRef(player);
  playerRef.current = player;
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [snapToBeat, setSnapToBeat] = useState(false);
  const [analyzingBeat, setAnalyzingBeat] = useState(false);
  const [loopRegion, setLoopRegion] = useState<TrimRegion | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [selStartInput, setSelStartInput] = useState("");
  const [selEndInput, setSelEndInput] = useState("");
  const [selStartFocused, setSelStartFocused] = useState(false);
  const [selEndFocused, setSelEndFocused] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<"result" | "original">("result");
  const [listenResult, setListenResult] = useState(false);
  const [cutPreview, setCutPreview] = useState<{
    buffer: AudioBuffer;
    settings: ManualEditSettings;
  } | null>(null);
  const [cutPreviewBusy, setCutPreviewBusy] = useState(false);
  const compareSeqRef = useRef<{
    phase: "orig" | "result";
    origEnd: number;
    resultStart: number;
    resultEnd: number;
  } | null>(null);

  const isTrackActive = activeObject.type === "track" && activeObject.trackId === track.id;
  const isProgramActive = activeObject.type === "program";

  const effEnd = effectiveTrimEnd(settings, track.duration);
  const mappingSettings = cutPreview?.settings ?? settings;
  const mappingSettingsRef = useRef(mappingSettings);
  mappingSettingsRef.current = mappingSettings;
  const previewHasBufferRef = useRef(false);
  const waveBuffer = cutPreview?.buffer ?? processedBuffer;
  const finalDuration =
    cutPreview?.buffer.duration ??
    (resultDuration || computeResultDuration(track.duration, settings));
  const durationChanged = Math.abs(finalDuration - track.duration) > 0.05;
  const sourceCompare = compareMode === "original" && !cutPreview;

  const playheadOnWave = useMemo(
    () => {
      if (!isTrackActive) return 0;
      if (sourceCompare) return player.currentTime;
      return mapResultTimeToSource(player.currentTime, track.duration, mappingSettings);
    },
    [isTrackActive, sourceCompare, player.currentTime, track.duration, mappingSettings],
  );

  const getPlayheadTime = useCallback(
    () => {
      if (!isTrackActive) return 0;
      if (sourceCompare) return player.currentTimeRef.current;
      return mapResultTimeToSource(player.currentTimeRef.current, track.duration, mappingSettings);
    },
    [isTrackActive, sourceCompare, player.currentTimeRef, track.duration, mappingSettings],
  );

  const prevTrackIdRef = useRef(track.id);

  useEffect(() => {
    if (prevTrackIdRef.current === track.id) return;
    prevTrackIdRef.current = track.id;
    setLoopRegion(null);
    setLoopEnabled(false);
    setCutError(null);
    setCompareMode("result");
    setListenResult(false);
    setCutPreview(null);
    compareSeqRef.current = null;
  }, [track.id]);

  useEffect(() => {
    if (listenResult || !isTrackActive || !loopRegion || !loopEnabled) {
      setLoopRef.current(null, false);
      return;
    }
    if (compareMode === "original") {
      setLoopRef.current({ start: loopRegion.start, end: loopRegion.end }, true);
      return;
    }
    const start = mapSourceTimeToResult(loopRegion.start, track.duration, settings);
    const end = mapSourceTimeToResult(loopRegion.end, track.duration, settings);
    if (end - start < 0.05) {
      setLoopRef.current(null, false);
      return;
    }
    setLoopRef.current({ start, end }, true);
  }, [isTrackActive, loopRegion, loopEnabled, track.duration, settings, compareMode, listenResult]);

  const snapLoopTime = useCallback(
    (time: number) => {
      if (!snapToBeat || !track.beatGrid) return time;
      return snapToBeatFn(time, track.beatGrid.bpm, track.beatGrid.offset);
    },
    [snapToBeat, track.beatGrid],
  );

  useEffect(() => {
    if (!startFocused) {
      setStartInput(formatTimePrecise(settings.trimStart));
    } else {
      setStartInput(formatTimeMs(settings.trimStart));
    }
  }, [settings.trimStart, track.id, startFocused]);

  useEffect(() => {
    if (!endFocused) {
      setEndInput(formatTimePrecise(effEnd));
    } else {
      setEndInput(formatTimeMs(effEnd));
    }
  }, [effEnd, track.id, endFocused]);

  useEffect(() => {
    if (!loopRegion) {
      setSelStartInput("");
      setSelEndInput("");
      return;
    }
    if (!selStartFocused) setSelStartInput(formatTimePrecise(loopRegion.start));
    else setSelStartInput(formatTimeMs(loopRegion.start));
  }, [loopRegion, selStartFocused]);

  useEffect(() => {
    if (!loopRegion) return;
    if (!selEndFocused) setSelEndInput(formatTimePrecise(loopRegion.end));
    else setSelEndInput(formatTimeMs(loopRegion.end));
  }, [loopRegion, selEndFocused]);

  const seekFromSourceTime = useCallback(
    (sourceTime: number) => {
      if (sourceCompare) {
        player.seek(sourceTime);
        return;
      }
      const resultTime = mapSourceTimeToResult(sourceTime, track.duration, mappingSettings);
      player.seek(resultTime);
    },
    [sourceCompare, track.duration, mappingSettings, player],
  );

  const handleWaveformSeek = (sourceTime: number) => {
    seekFromSourceTime(sourceTime);
  };

  const playheadSource = sourceCompare
    ? player.currentTime
    : getPlayheadSourceTime(player.currentTime, track.duration, mappingSettings);

  useEffect(() => {
    if (listenResult) return;
    setCompareMode("result");
    compareSeqRef.current = null;
  }, [processedBuffer, listenResult]);

  const switchCompare = useCallback(
    (mode: "result" | "original") => {
      if (listenResult) return;
      if (mode === compareMode) return;
      compareSeqRef.current = null;
      const playing = player.isPlaying;
      if (mode === "original") {
        const src = mapResultTimeToSource(player.currentTime, track.duration, settings);
        player.load(track.buffer);
        setCompareMode("original");
        if (playing) player.play(src);
        else player.seek(src);
        return;
      }
      if (!processedBuffer) {
        setCompareMode("result");
        return;
      }
      const resultTime = mapSourceTimeToResult(player.currentTime, track.duration, settings);
      player.load(processedBuffer);
      setCompareMode("result");
      if (playing) player.play(resultTime);
      else player.seek(resultTime);
    },
    [compareMode, player, track.buffer, track.duration, settings, processedBuffer, listenResult],
  );

  const compareSelection = () => {
    if (listenResult || !loopRegion || !processedBuffer) return;
    compareSeqRef.current = {
      phase: "orig",
      origEnd: loopRegion.end,
      resultStart: mapSourceTimeToResult(loopRegion.start, track.duration, settings),
      resultEnd: mapSourceTimeToResult(loopRegion.end, track.duration, settings),
    };
    setLoopEnabled(false);
    setCompareMode("original");
    player.load(track.buffer);
    player.play(loopRegion.start);
  };

  useEffect(() => {
    const seq = compareSeqRef.current;
    if (!seq || !isTrackActive || listenResult) return;
    if (seq.phase === "orig" && player.currentTime >= seq.origEnd - 0.04) {
      if (!processedBuffer) {
        compareSeqRef.current = null;
        player.pause();
        return;
      }
      seq.phase = "result";
      setCompareMode("result");
      player.load(processedBuffer);
      player.play(seq.resultStart);
    } else if (seq.phase === "result" && player.currentTime >= seq.resultEnd - 0.04) {
      compareSeqRef.current = null;
      player.pause();
    }
  }, [player.currentTime, processedBuffer, isTrackActive, player, listenResult]);

  const nudgeSourcePlayhead = useCallback(
    (deltaSec: number) => {
      if (!isTrackActive) return;
      const next = clampTime(playheadSource + deltaSec, track.duration);
      seekFromSourceTime(next);
    },
    [isTrackActive, playheadSource, track.duration, seekFromSourceTime],
  );

  const handleDetectBeat = useCallback(async () => {
    setAnalyzingBeat(true);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const grid = detectBeatGrid(track.buffer, {
        start: settings.trimStart,
        end: effEnd,
      });
      onBeatGridChange(track.id, grid);
    } finally {
      setAnalyzingBeat(false);
    }
  }, [track.buffer, track.id, settings.trimStart, effEnd, onBeatGridChange]);

  useEffect(() => {
    const section = waveSectionRef.current;
    if (!section || !isTrackActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      const delta = e.shiftKey ? 0.1 : 0.01;
      if (e.key === "ArrowLeft") nudgeSourcePlayhead(-delta);
      else nudgeSourcePlayhead(delta);
    };

    section.addEventListener("keydown", onKeyDown);
    return () => section.removeEventListener("keydown", onKeyDown);
  }, [isTrackActive, nudgeSourcePlayhead]);

  const parseTimeInput = (value: string) => parseTimeMs(value) ?? parseTimePrecise(value);

  const setLoopStartHere = () => {
    const t = snapLoopTime(clampTime(playheadSource, track.duration));
    setLoopRegion((prev) => {
      if (!prev) {
        const start = t;
        const end = clampTime(Math.max(t + 2, t + 0.05), track.duration);
        if (end - start < 0.05) {
          return { start: clampTime(t - 2, track.duration), end: t };
        }
        return { start, end };
      }
      return {
        start: clampTime(Math.min(t, prev.end - 0.05), track.duration),
        end: prev.end,
      };
    });
    setCutError(null);
  };

  const setLoopEndHere = () => {
    const t = snapLoopTime(clampTime(playheadSource, track.duration));
    setLoopRegion((prev) => {
      if (!prev) {
        const end = t;
        const start = clampTime(Math.min(t - 2, t - 0.05), track.duration);
        if (end - start < 0.05) {
          return { start: t, end: clampTime(t + 2, track.duration) };
        }
        return { start, end };
      }
      return {
        start: prev.start,
        end: clampTime(Math.max(t, prev.start + 0.05), track.duration),
      };
    });
    setCutError(null);
  };

  const ensureSelection = useCallback((): TrimRegion | null => {
    if (loopRegion) return loopRegion;
    const t = snapLoopTime(clampTime(playheadSource, track.duration));
    const start = clampTime(t - 1, track.duration);
    const end = clampTime(Math.max(t + 1, start + 0.5), track.duration);
    if (end - start < 0.05) return null;
    const region = { start, end };
    setLoopRegion(region);
    return region;
  }, [loopRegion, snapLoopTime, playheadSource, track.duration]);

  const nudgeSelection = (edge: "start" | "end", delta: number) => {
    setLoopRegion((prev) => {
      const base =
        prev ??
        ({
          start: clampTime(playheadSource, track.duration),
          end: clampTime(playheadSource + 1, track.duration),
        } satisfies TrimRegion);
      if (edge === "start") {
        return {
          start: clampTime(Math.min(base.start + delta, base.end - 0.05), track.duration),
          end: base.end,
        };
      }
      return {
        start: base.start,
        end: clampTime(Math.max(base.end + delta, base.start + 0.05), track.duration),
      };
    });
    setCutError(null);
  };

  const applySelStartInput = () => {
    if (!selStartInput.trim()) return;
    const parsed = parseTimeInput(selStartInput);
    if (parsed === null) {
      setCutError("Формат: 00:00.0 или 00:00.000");
      return;
    }
    const t = snapLoopTime(clampTime(parsed, track.duration));
    setLoopRegion((prev) => {
      if (!prev) {
        return {
          start: t,
          end: clampTime(Math.min(t + 2, track.duration), track.duration),
        };
      }
      return {
        start: clampTime(Math.min(t, prev.end - 0.05), track.duration),
        end: prev.end,
      };
    });
    setCutError(null);
  };

  const applySelEndInput = () => {
    if (!selEndInput.trim()) return;
    const parsed = parseTimeInput(selEndInput);
    if (parsed === null) {
      setCutError("Формат: 00:00.0 или 00:00.000");
      return;
    }
    const t = snapLoopTime(clampTime(parsed, track.duration));
    setLoopRegion((prev) => {
      if (!prev) {
        return {
          start: clampTime(Math.max(t - 2, 0), track.duration),
          end: t,
        };
      }
      return {
        start: prev.start,
        end: clampTime(Math.max(t, prev.start + 0.05), track.duration),
      };
    });
    setCutError(null);
  };

  const closeListenResult = useCallback(() => {
    const p = playerRef.current;
    const preview = cutPreview;
    const src = preview
      ? mapResultTimeToSource(p.currentTimeRef.current, track.duration, preview.settings)
      : mapResultTimeToSource(p.currentTimeRef.current, track.duration, settings);
    setListenResult(false);
    setCutPreview(null);
    setCutPreviewBusy(false);
    if (!processedBuffer) return;
    const resultTime = mapSourceTimeToResult(src, track.duration, settings);
    const playing = p.wantPlayingRef.current;
    p.load(processedBuffer, { resetTime: false });
    if (playing) p.play(resultTime);
    else p.seek(resultTime);
  }, [cutPreview, track.duration, processedBuffer, settings]);

  useEffect(() => {
    if (!listenResult) {
      previewHasBufferRef.current = false;
      return;
    }
    if (!loopRegion) return;
    const previewSettings = settingsWithPendingCut(settings, track.duration, loopRegion);
    if (!previewSettings) {
      setCutError("После выреза должна остаться хотя бы короткая часть трека");
      setCutPreviewBusy(false);
      return;
    }

    let cancelled = false;
    setCutPreviewBusy(true);
    const delay = previewHasBufferRef.current ? 140 : 0;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const buffer = await processSingleTrack(track.buffer, previewSettings);
          if (cancelled) return;
          const p = playerRef.current;
          const sourceNow = mapResultTimeToSource(
            p.currentTimeRef.current,
            track.duration,
            mappingSettingsRef.current,
          );
          const resumeAt = mapSourceTimeToResult(sourceNow, track.duration, previewSettings);
          const shouldPlay = p.wantPlayingRef.current || !previewHasBufferRef.current;
          previewHasBufferRef.current = true;
          setCutPreview({ buffer, settings: previewSettings });
          setCompareMode("result");
          p.load(buffer, { resetTime: false });
          const clamped = Math.min(Math.max(0, resumeAt), Math.max(0, buffer.duration - 0.02));
          if (shouldPlay) p.play(clamped);
          else p.seek(clamped);
        } catch {
          if (!cancelled) setCutError("Не удалось собрать результат");
        } finally {
          if (!cancelled) setCutPreviewBusy(false);
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listenResult, loopRegion, settings, track.buffer, track.duration]);

  const playCutPreview = () => {
    const p = playerRef.current;
    p.unlock();
    p.wantPlayingRef.current = true;
    if (cutPreview && !cutPreviewBusy) p.play();
  };

  const openListenResult = () => {
    const region = ensureSelection();
    if (!region) {
      setCutError("Сначала отметьте участок на волне");
      return;
    }
    if (!settingsWithPendingCut(settings, track.duration, region)) {
      setCutError("После выреза должна остаться хотя бы короткая часть трека");
      return;
    }
    const p = playerRef.current;
    p.unlock();
    p.pause();
    p.wantPlayingRef.current = true;
    setLoopEnabled(false);
    compareSeqRef.current = null;
    setCutError(null);
    setListenResult(true);
  };

  const handleApplyCut = () => {
    const region = loopRegion ?? ensureSelection();
    if (!region) return;
    const next = addCutRegion(track.duration, settings, region);
    if (!next) {
      setCutError("После выреза должна остаться хотя бы короткая часть трека");
      return;
    }
    onBeginGesture();
    onSettingsChange({ cutRegions: next });
    onEndGesture();
    setLoopRegion(null);
    setLoopEnabled(false);
    setListenResult(false);
    setCutPreview(null);
    setCutError(null);
  };

  const handleRemoveCut = (index: number) => {
    onSettingsChange({
      cutRegions: settings.cutRegions.filter((_, i) => i !== index),
    });
  };

  const canApplyCut =
    loopRegion !== null && isCutWithinKeep(loopRegion, track.duration, settings);

  const applyStartInput = () => {
    if (!startInput.trim()) {
      setStartInput(formatTimePrecise(settings.trimStart));
      return;
    }
    const parsed = parseTimeInput(startInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0 или 00:00.000");
      return;
    }
    const clamped = clampTime(parsed, track.duration);
    if (clamped >= effEnd - 0.1) {
      setTimeError("Начало должно быть раньше конца");
      return;
    }
    setTimeError(null);
    onSettingsChange({ trimStart: clamped });
  };

  const applyEndInput = () => {
    if (!endInput.trim()) {
      setEndInput(formatTimePrecise(effEnd));
      return;
    }
    const parsed = parseTimeInput(endInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0 или 00:00.000");
      return;
    }
    const clamped = clampTime(parsed, track.duration);
    if (clamped <= settings.trimStart + 0.1) {
      setTimeError("Конец должен быть позже начала");
      return;
    }
    setTimeError(null);
    onSettingsChange({ trimEnd: clamped >= track.duration - 0.05 ? null : clamped });
  };

  return (
    <div className="space-y-3">
      {durationChanged && isTrackActive && (
        <p className="text-[11px] text-gray-500 px-0.5">
          После правки: <strong className="text-gray-800">{formatTimePrecise(finalDuration)}</strong>
          <span className="text-gray-400 ml-1">(было {formatTimePrecise(track.duration)})</span>
        </p>
      )}

      <section
        className={[
          cardClass,
          isTrackActive ? "border-gray-900 ring-2 ring-gray-900/10" : "",
          !isTrackActive ? "hover:border-gray-300 cursor-pointer" : "",
        ].join(" ")}
        onClick={onActivateTrack}
      >
        <p className={sectionLabel}>Волна и обрезка</p>
        <div
          ref={waveSectionRef}
          tabIndex={isTrackActive ? 0 : -1}
          className={isTrackActive ? "outline-none" : inactiveClass}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <WaveformEditor
            buffer={track.buffer}
            peaks={track.peaks}
            duration={track.duration}
            currentTime={playheadOnWave}
            isPlaying={isTrackActive && player.isPlaying}
            getPlayheadTime={isTrackActive ? getPlayheadTime : undefined}
            trimStart={settings.trimStart}
            trimEnd={settings.trimEnd}
            cutRegions={settings.cutRegions}
            loopRegion={loopRegion}
            editRegions={settings.editRegions ?? []}
            processedBuffer={waveBuffer}
            resultCurrentTime={
              sourceCompare
                ? mapSourceTimeToResult(player.currentTime, track.duration, settings)
                : player.currentTime
            }
            onResultSeek={(t) => {
              if (listenResult) {
                player.seek(t);
                return;
              }
              if (compareMode === "original") switchCompare("result");
              player.seek(t);
            }}
            beatGrid={track.beatGrid}
            snapToBeat={snapToBeat}
            onSeek={handleWaveformSeek}
            onTrimStartChange={(t) => {
              onSettingsChange({ trimStart: clampTime(Math.min(t, effEnd - 0.01), track.duration) });
            }}
            onTrimEndChange={(t) => {
              onSettingsChange({
                trimEnd: t === null || t >= track.duration - 0.001 ? null : t,
              });
            }}
            onLoopRegionChange={setLoopRegion}
            height={156}
          />
          {listenResult && (
            <>
              <div className="h-36 md:hidden" aria-hidden />
              <CutPreviewBar
                isPlaying={player.isPlaying && isTrackActive}
                currentTime={isTrackActive ? player.currentTime : 0}
                duration={cutPreview?.buffer.duration || 0}
                selectionLabel={
                  loopRegion
                    ? `${formatTimeMs(loopRegion.start)} – ${formatTimeMs(loopRegion.end)}`
                    : "участка"
                }
                resultLabel={formatTimePrecise(
                  cutPreview?.buffer.duration ||
                    computeResultDuration(track.duration, mappingSettings),
                )}
                busy={cutPreviewBusy || !cutPreview}
                canSave={canApplyCut}
                onPlay={playCutPreview}
                onPause={() => player.pause()}
                onSeek={(t) => isTrackActive && player.seek(t)}
                onClose={closeListenResult}
                onSave={handleApplyCut}
              />
            </>
          )}

          <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50/40 p-2 space-y-2">
            <p className={sectionLabel}>Участок — сначала послушать, потом сохранить</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={setLoopStartHere} className={btnClass}>
                Начало у курсора
              </button>
              <button type="button" onClick={setLoopEndHere} className={btnClass}>
                Конец у курсора
              </button>
              <button
                type="button"
                onClick={() => {
                  if (listenResult) closeListenResult();
                  setLoopRegion(null);
                  setLoopEnabled(false);
                  setCutError(null);
                }}
                disabled={!loopRegion}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить участок
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!loopRegion || listenResult) return;
                  if (!loopEnabled) seekFromSourceTime(loopRegion.start);
                  setLoopEnabled((v) => !v);
                }}
                disabled={!loopRegion || listenResult}
                className={[
                  btnClass,
                  loopEnabled && !listenResult ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800" : "",
                  !loopRegion || listenResult ? "opacity-40" : "",
                ].join(" ")}
              >
                {loopEnabled ? "Повтор вкл" : "Повтор участка"}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-500 w-12 shrink-0">Начало</span>
                <button type="button" onClick={() => nudgeSelection("start", -0.01)} className={btnClass}>
                  −
                </button>
                <TimeField
                  value={selStartInput}
                  onChange={setSelStartInput}
                  onCommit={applySelStartInput}
                  onFocus={() => setSelStartFocused(true)}
                  onBlurExtra={() => setSelStartFocused(false)}
                  className={inputClass}
                />
                <button type="button" onClick={() => nudgeSelection("start", 0.01)} className={btnClass}>
                  +
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-500 w-12 shrink-0">Конец</span>
                <button type="button" onClick={() => nudgeSelection("end", -0.01)} className={btnClass}>
                  −
                </button>
                <TimeField
                  value={selEndInput}
                  onChange={setSelEndInput}
                  onCommit={applySelEndInput}
                  onFocus={() => setSelEndFocused(true)}
                  onBlurExtra={() => setSelEndFocused(false)}
                  className={inputClass}
                />
                <button type="button" onClick={() => nudgeSelection("end", 0.01)} className={btnClass}>
                  +
                </button>
              </div>
            </div>
            {loopRegion && (
              <p className="text-[11px] font-mono text-rose-700">
                {formatTimeMs(loopRegion.start)} – {formatTimeMs(loopRegion.end)}
                <span className="text-rose-500 ml-1">
                  ({formatTimeMs(loopRegion.end - loopRegion.start)})
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={openListenResult}
                disabled={listenResult}
                className={[
                  btnClass,
                  listenResult ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800" : "",
                ].join(" ")}
              >
                {cutPreviewBusy ? "Готовим результат…" : "Послушать результат"}
              </button>
              <button
                type="button"
                onClick={handleApplyCut}
                disabled={!canApplyCut}
                className={`${btnClass} text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40`}
              >
                Сохранить вырез
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              Ручки на волне: начало сверху, конец снизу — чтобы не сливались с бегунком. Участок
              можно ставить с начала или с конца трека. «Послушать результат» играет без этого куска,
              файл не меняется. «Сохранить вырез» записывает правку.
            </p>
            {settings.cutRegions.length > 0 && (
              <ul className="space-y-1">
                {settings.cutRegions.map((cut, i) => (
                  <li
                    key={`${cut.start}-${cut.end}-${i}`}
                    className="flex items-center justify-between gap-2 text-[11px] font-mono text-red-700 bg-red-50/80 rounded-lg px-2 py-1"
                  >
                    <span>
                      Вырезано: {formatTimeMs(cut.start)} – {formatTimeMs(cut.end)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCut(i)}
                      className="text-red-500 hover:text-red-700 shrink-0"
                      aria-label="Убрать вырез"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {cutError && <p className="text-[11px] text-red-600">{cutError}</p>}
          </div>

          <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-2 space-y-2">
            <p className={sectionLabel}>Ритм — сетка тактов, не скорость</p>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={handleDetectBeat}
                disabled={analyzingBeat}
                className={`${btnClass} disabled:opacity-50`}
              >
                {analyzingBeat ? "Анализ…" : "Определить BPM"}
              </button>
              {track.beatGrid ? (
                <span className="text-[11px] font-mono text-gray-600 px-1">
                  сетка {Math.round(track.beatGrid.bpm)} ·{" "}
                  {Math.round(track.beatGrid.confidence * 100)}%
                </span>
              ) : (
                <span className="text-[11px] text-gray-400 px-1">сетка {DEFAULT_SOURCE_BPM}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  const base = track.beatGrid ?? {
                    bpm: DEFAULT_SOURCE_BPM,
                    offset: 0,
                    confidence: 0,
                  };
                  onBeatGridChange(track.id, { ...base, offset: base.offset - 0.01 });
                }}
                className={btnClass}
              >
                Сетка −10ms
              </button>
              <button
                type="button"
                onClick={() => {
                  const base = track.beatGrid ?? {
                    bpm: DEFAULT_SOURCE_BPM,
                    offset: 0,
                    confidence: 0,
                  };
                  onBeatGridChange(track.id, { ...base, offset: base.offset + 0.01 });
                }}
                className={btnClass}
              >
                Сетка +10ms
              </button>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapToBeat}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setSnapToBeat(enabled);
                    if (enabled && !track.beatGrid) {
                      onBeatGridChange(track.id, {
                        bpm: DEFAULT_SOURCE_BPM,
                        offset: 0,
                        confidence: 0,
                      });
                    }
                  }}
                  className="rounded border-gray-300"
                />
                Привязка к такту
              </label>
            </div>
            <p className="text-[10px] text-gray-400">
              Сетка только рисует доли и помогает резать по такту. Скорость музыки — блок «Звук»
              ниже. Перемотка — кнопки под плеером.
            </p>
          </div>

          <div className={`mt-2 ${listenResult ? "opacity-40 pointer-events-none" : ""}`}>
            <PlaybackControls
              isPlaying={player.isPlaying && isTrackActive && !listenResult}
              currentTime={isTrackActive && !listenResult ? player.currentTime : 0}
              duration={
                isTrackActive
                  ? sourceCompare
                    ? track.duration
                    : player.duration || finalDuration
                  : finalDuration
              }
              onPlay={() => !isRendering && isTrackActive && !listenResult && player.play()}
              onPause={() => player.pause()}
              onStop={() => player.stop()}
              onSeek={(t) => isTrackActive && !listenResult && player.seek(t)}
              onSkipBack={() => isTrackActive && !listenResult && player.skip(-5)}
              onSkipForward={() => isTrackActive && !listenResult && player.skip(5)}
              isRendering={isRendering && isTrackActive && !listenResult}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              <button
                type="button"
                onClick={() => switchCompare("result")}
                disabled={listenResult}
                className={[
                  btnClass,
                  !listenResult && compareMode === "result"
                    ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                    : "",
                  listenResult ? "opacity-40" : "",
                ].join(" ")}
              >
                Сохранённый результат
              </button>
              <button
                type="button"
                onClick={() => switchCompare("original")}
                disabled={listenResult}
                className={[
                  btnClass,
                  !listenResult && compareMode === "original"
                    ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                    : "",
                  listenResult ? "opacity-40" : "",
                ].join(" ")}
              >
                Оригинал
              </button>
              <button
                type="button"
                onClick={compareSelection}
                disabled={listenResult || !loopRegion || !processedBuffer}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сравнить выделение
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider self-center mr-1">
                Перемотка
              </span>
              <button type="button" onClick={() => nudgeSourcePlayhead(-0.1)} className={btnClass}>
                −100ms
              </button>
              <button type="button" onClick={() => nudgeSourcePlayhead(-0.01)} className={btnClass}>
                −10ms
              </button>
              <button type="button" onClick={() => nudgeSourcePlayhead(0.01)} className={btnClass}>
                +10ms
              </button>
              <button type="button" onClick={() => nudgeSourcePlayhead(0.1)} className={btnClass}>
                +100ms
              </button>
              <span className="text-[10px] text-gray-400 self-center hidden sm:inline">
                ←/→ 10ms · Shift+←/→ 100ms
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 space-y-2 mt-2">
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => onSettingsChange({ trimStart: playheadSource })} className={btnClass}>
                Начало здесь
              </button>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    trimEnd: playheadSource >= track.duration - 0.05 ? null : playheadSource,
                  })
                }
                className={btnClass}
              >
                Конец здесь
              </button>
              <span className="w-px h-5 bg-gray-200 self-center mx-0.5 hidden sm:block" />
              <HistoryToolbar compact canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
              <span className="w-px h-5 bg-gray-200 self-center mx-0.5 hidden sm:block" />
              <button
                type="button"
                onClick={() => onSettingsChange({ trimStart: 0 })}
                disabled={!hasTrimStart(settings)}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить начало
              </button>
              <button
                type="button"
                onClick={() => onSettingsChange({ trimEnd: null })}
                disabled={!hasTrimEnd(settings, track.duration)}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить конец
              </button>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    trimStart: 0,
                    trimEnd: null,
                    cutRegions: [],
                    playbackRate: 1,
                    eq: cloneEq(FLAT_EQ),
                    editRegions: [],
                    volume: 1,
                  })
                }
                className={`${btnClass} text-red-600 border-red-200 hover:bg-red-50`}
              >
                Сбросить всё
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 w-12 shrink-0">Начало</span>
                  <TimeField
                    value={startInput}
                    onChange={setStartInput}
                    onCommit={applyStartInput}
                    onFocus={() => setStartFocused(true)}
                    onBlurExtra={() => setStartFocused(false)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Плавный старт (сек)</label>
                  <SecondsField
                    value={settings.fadeIn}
                    onChange={(fadeIn) => onSettingsChange({ fadeIn }, { skipHistory: true })}
                    min={0}
                    max={30}
                    step={0.5}
                    onBeginGesture={onBeginGesture}
                    onEndGesture={onEndGesture}
                    className={`${inputClass} mt-0.5`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 w-12 shrink-0">Конец</span>
                  <TimeField
                    value={endInput}
                    onChange={setEndInput}
                    onCommit={applyEndInput}
                    onFocus={() => setEndFocused(true)}
                    onBlurExtra={() => setEndFocused(false)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Плавный финиш (сек)</label>
                  <SecondsField
                    value={settings.fadeOut}
                    onChange={(fadeOut) => onSettingsChange({ fadeOut }, { skipHistory: true })}
                    min={0}
                    max={30}
                    step={0.5}
                    onBeginGesture={onBeginGesture}
                    onEndGesture={onEndGesture}
                    className={`${inputClass} mt-0.5`}
                  />
                </div>
              </div>
            </div>
            {timeError && <p className="text-[11px] text-red-600">{timeError}</p>}
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${!isTrackActive ? inactiveClass : ""}`}>
        <SoundEditPanel
          settings={settings}
          loopRegion={loopRegion}
          sourceBpm={track.beatGrid?.bpm ?? null}
          onSettingsChange={onSettingsChange}
          onBeginGesture={onBeginGesture}
          onEndGesture={onEndGesture}
        />
      </section>

      <ProgramPanel
        tracks={tracks}
        manualSettings={manualSettings}
        programTrackIds={programTrackIds}
        transitions={transitions}
        programSettings={programSettings}
        isActive={isProgramActive}
        isRendering={isRendering}
        programDuration={programDuration}
        player={player}
        canUndo={canUndo}
        canRedo={canRedo}
        onActivate={onActivateProgram}
        onReorder={onProgramReorder}
        onTransitionChange={onTransitionChange}
        onRemoveFromProgram={onRemoveFromProgram}
        onProgramSettingsChange={onProgramSettingsChange}
        onBeginGesture={onBeginGesture}
        onEndGesture={onEndGesture}
        onUndo={onUndo}
        onRedo={onRedo}
      />

      <ExportPanel
        format={exportFormat}
        onFormatChange={onExportFormatChange}
        onExport={onExport}
        exporting={exporting}
        filename={exportFilename}
        saveTargetLabel={saveTargetLabel}
        disabled={exportDisabled}
      />
    </div>
  );
}
