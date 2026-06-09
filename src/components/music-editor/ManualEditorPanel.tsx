"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { WaveformEditor } from "./WaveformEditor";
import { PlaybackControls } from "./AudioPlayer";
import { ExportPanel } from "./ExportPanel";
import { HistoryToolbar } from "./HistoryToolbar";
import { ProgramPanel } from "./ProgramPanel";
import {
  formatTimePrecise,
  parseTimePrecise,
  clampTime,
} from "@/lib/music-editor/format";
import {
  computeResultDuration,
  effectiveTrimEnd,
  hasTrimStart,
  hasTrimEnd,
  mapResultTimeToSource,
  mapSourceTimeToResult,
  getPlayheadSourceTime,
} from "@/lib/music-editor/selection";
import type {
  ActiveObject,
  AudioTrack,
  ExportFormat,
  ManualEditSettings,
  ProgramTransition,
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
}

const inputClass =
  "w-full px-2 py-1 text-xs font-mono text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/5";

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
}: ManualEditorPanelProps) {
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);

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

  useEffect(() => {
    setStartInput(formatTimePrecise(settings.trimStart));
    setEndInput(formatTimePrecise(effEnd));
  }, [settings.trimStart, effEnd, track.id]);

  const seekFromSourceTime = (sourceTime: number) => {
    const resultTime = mapSourceTimeToResult(sourceTime, track.duration, settings);
    player.seek(resultTime);
  };

  const handleWaveformSeek = (sourceTime: number) => {
    seekFromSourceTime(sourceTime);
  };

  const playheadSource = getPlayheadSourceTime(player.currentTime, track.duration, settings);

  const applyStartInput = () => {
    const parsed = parseTimePrecise(startInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0");
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
    const parsed = parseTimePrecise(endInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0");
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
          className={isTrackActive ? "" : inactiveClass}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <WaveformEditor
            peaks={track.peaks}
            duration={track.duration}
            currentTime={playheadOnWave}
            isPlaying={isTrackActive && player.isPlaying}
            getPlayheadTime={isTrackActive ? getPlayheadTime : undefined}
            trimStart={settings.trimStart}
            trimEnd={settings.trimEnd}
            cutRegions={[]}
            pendingCut={null}
            onSeek={handleWaveformSeek}
            onTrimStartChange={(t) => {
              onSettingsChange({ trimStart: clampTime(Math.min(t, effEnd - 0.1), track.duration) });
            }}
            onTrimEndChange={(t) => {
              onSettingsChange({
                trimEnd: t === null || t >= track.duration - 0.05 ? null : t,
              });
            }}
            height={88}
          />

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
                  <input
                    type="text"
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    onBlur={applyStartInput}
                    onKeyDown={(e) => e.key === "Enter" && applyStartInput()}
                    className={inputClass}
                    placeholder="00:00.0"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Плавный старт (сек)</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={settings.fadeIn}
                    onChange={(e) =>
                      onSettingsChange({ fadeIn: Number(e.target.value) }, { skipHistory: true })
                    }
                    onBlur={onEndGesture}
                    onPointerDown={onBeginGesture}
                    className={`${inputClass} mt-0.5`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 w-12 shrink-0">Конец</span>
                  <input
                    type="text"
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    onBlur={applyEndInput}
                    onKeyDown={(e) => e.key === "Enter" && applyEndInput()}
                    className={inputClass}
                    placeholder="00:00.0"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Плавный финиш (сек)</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={settings.fadeOut}
                    onChange={(e) =>
                      onSettingsChange({ fadeOut: Number(e.target.value) }, { skipHistory: true })
                    }
                    onBlur={onEndGesture}
                    onPointerDown={onBeginGesture}
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
