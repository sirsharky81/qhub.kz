"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { WaveformEditor } from "./WaveformEditor";
import { PlaybackControls } from "./AudioPlayer";
import { ExportPanel } from "./ExportPanel";
import { HistoryToolbar } from "./HistoryToolbar";
import { ProgramPanel } from "./ProgramPanel";
import { TimeField, SecondsField } from "./EditorInputs";
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
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [snapToBeat, setSnapToBeat] = useState(false);
  const [analyzingBeat, setAnalyzingBeat] = useState(false);
  const [loopRegion, setLoopRegion] = useState<TrimRegion | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);

  const isTrackActive = activeObject.type === "track" && activeObject.trackId === track.id;
  const isProgramActive = activeObject.type === "program";

  const effEnd = effectiveTrimEnd(settings, track.duration);
  const finalDuration = resultDuration || computeResultDuration(track.duration, settings);
  const isTrimmed = finalDuration < track.duration - 0.5;

  const playheadOnWave = useMemo(
    () =>
      isTrackActive
        ? mapResultTimeToSource(player.currentTime, track.duration, settings)
        : 0,
    [isTrackActive, player.currentTime, track.duration, settings],
  );

  const getPlayheadTime = useCallback(
    () =>
      isTrackActive
        ? mapResultTimeToSource(player.currentTimeRef.current, track.duration, settings)
        : 0,
    [isTrackActive, player.currentTimeRef, track.duration, settings],
  );

  const prevTrackIdRef = useRef(track.id);

  useEffect(() => {
    if (prevTrackIdRef.current === track.id) return;
    prevTrackIdRef.current = track.id;
    setLoopRegion(null);
    setLoopEnabled(false);
    setCutError(null);
  }, [track.id]);

  useEffect(() => {
    if (!isTrackActive || !loopRegion || !loopEnabled) {
      setLoopRef.current(null, false);
      return;
    }
    const start = mapSourceTimeToResult(loopRegion.start, track.duration, settings);
    const end = mapSourceTimeToResult(loopRegion.end, track.duration, settings);
    if (end - start < 0.05) {
      setLoopRef.current(null, false);
      return;
    }
    setLoopRef.current({ start, end }, true);
  }, [isTrackActive, loopRegion, loopEnabled, track.duration, settings]);

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

  const seekFromSourceTime = useCallback(
    (sourceTime: number) => {
      const resultTime = mapSourceTimeToResult(sourceTime, track.duration, settings);
      player.seek(resultTime);
    },
    [track.duration, settings, player],
  );

  const handleWaveformSeek = (sourceTime: number) => {
    seekFromSourceTime(sourceTime);
  };

  const playheadSource = getPlayheadSourceTime(player.currentTime, track.duration, settings);

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

  const adjustBeatGrid = useCallback(
    (patch: Partial<BeatGrid>) => {
      const base = track.beatGrid ?? { bpm: 120, offset: 0, confidence: 0 };
      onBeatGridChange(track.id, { ...base, ...patch });
    },
    [track.beatGrid, track.id, onBeatGridChange],
  );

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
        return {
          start: Math.max(settings.trimStart, t),
          end: clampTime(Math.min(t + 2, effEnd), track.duration),
        };
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
        return {
          start: clampTime(Math.max(t - 2, settings.trimStart), track.duration),
          end: Math.min(t, effEnd),
        };
      }
      return {
        start: prev.start,
        end: clampTime(Math.max(t, prev.start + 0.05), track.duration),
      };
    });
    setCutError(null);
  };

  const handleApplyCut = () => {
    if (!loopRegion) return;
    const next = addCutRegion(track.duration, settings, loopRegion);
    if (!next) {
      setCutError("Участок должен быть внутри сохраняемой части (мин. 50 мс)");
      return;
    }
    onBeginGesture();
    onSettingsChange({ cutRegions: next });
    onEndGesture();
    setLoopRegion(null);
    setLoopEnabled(false);
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

  const sliderGesture = {
    onPointerDown: onBeginGesture,
    onPointerUp: onEndGesture,
    onPointerLeave: onEndGesture,
  };

  return (
    <div className="space-y-3">
      {isTrimmed && isTrackActive && (
        <p className="text-[11px] text-gray-500 px-0.5">
          После обрезки: <strong className="text-gray-800">{formatTimePrecise(finalDuration)}</strong>
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
            height={140}
          />

          <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2 space-y-2">
            <p className={sectionLabel}>Loop и вырезка</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={setLoopStartHere} className={btnClass}>
                Начало loop
              </button>
              <button type="button" onClick={setLoopEndHere} className={btnClass}>
                Конец loop
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!loopRegion) return;
                  if (!loopEnabled) {
                    seekFromSourceTime(loopRegion.start);
                  }
                  setLoopEnabled((v) => !v);
                }}
                disabled={!loopRegion}
                className={[
                  btnClass,
                  loopEnabled ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" : "",
                  !loopRegion ? "opacity-40" : "",
                ].join(" ")}
              >
                {loopEnabled ? "Loop вкл" : "Loop выкл"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoopRegion(null);
                  setLoopEnabled(false);
                  setCutError(null);
                }}
                disabled={!loopRegion}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить loop
              </button>
              <button
                type="button"
                onClick={handleApplyCut}
                disabled={!canApplyCut}
                className={`${btnClass} text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40`}
              >
                Вырезать участок
              </button>
            </div>
            {loopRegion && (
              <p className="text-[11px] font-mono text-indigo-700">
                Loop: {formatTimeMs(loopRegion.start)} – {formatTimeMs(loopRegion.end)}
                <span className="text-indigo-500 ml-1">
                  ({formatTimeMs(loopRegion.end - loopRegion.start)})
                </span>
              </p>
            )}
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
            <p className={sectionLabel}>Ритм</p>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={handleDetectBeat}
                disabled={analyzingBeat}
                className={`${btnClass} disabled:opacity-50`}
              >
                {analyzingBeat ? "Анализ…" : "Определить BPM"}
              </button>
              {track.beatGrid && (
                <>
                  <span className="text-[11px] font-mono text-gray-600 px-1">
                    {Math.round(track.beatGrid.bpm)} BPM ·{" "}
                    {Math.round(track.beatGrid.confidence * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustBeatGrid({ bpm: track.beatGrid!.bpm - 1 })}
                    className={btnClass}
                  >
                    BPM −
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustBeatGrid({ bpm: track.beatGrid!.bpm + 1 })}
                    className={btnClass}
                  >
                    BPM +
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustBeatGrid({ offset: track.beatGrid!.offset - 0.01 })}
                    className={btnClass}
                  >
                    Сдвиг −10ms
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustBeatGrid({ offset: track.beatGrid!.offset + 0.01 })}
                    className={btnClass}
                  >
                    Сдвиг +10ms
                  </button>
                </>
              )}
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapToBeat}
                  onChange={(e) => setSnapToBeat(e.target.checked)}
                  disabled={!track.beatGrid}
                  className="rounded border-gray-300"
                />
                Привязка к такту
              </label>
            </div>
          </div>

          <div className="mt-2">
            <PlaybackControls
              isPlaying={player.isPlaying && isTrackActive}
              currentTime={isTrackActive ? player.currentTime : 0}
              duration={isTrackActive ? player.duration || finalDuration : finalDuration}
              onPlay={() => !isRendering && isTrackActive && player.play()}
              onPause={() => player.pause()}
              onStop={() => player.stop()}
              onSeek={(t) => isTrackActive && player.seek(t)}
              onSkipBack={() => isTrackActive && player.skip(-5)}
              onSkipForward={() => isTrackActive && player.skip(5)}
              isRendering={isRendering && isTrackActive}
            />
            <div className="flex flex-wrap gap-1 mt-2">
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
                onClick={() => onSettingsChange({ trimStart: 0, trimEnd: null, cutRegions: [] })}
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
        <p className={sectionLabel}>Громкость</p>
        <label className="text-[11px] text-gray-500">
          Уровень — {Math.round(settings.volume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={200}
          value={settings.volume * 100}
          onChange={(e) =>
            onSettingsChange({ volume: Number(e.target.value) / 100 }, { skipHistory: true })
          }
          {...sliderGesture}
          className="w-full accent-gray-900 h-1.5"
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
