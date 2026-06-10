"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaybackControls } from "./AudioPlayer";
import { ProgramTimeline } from "./ProgramTimeline";
import { HistoryToolbar } from "./HistoryToolbar";
import { TimeField, SecondsField } from "./EditorInputs";
import {
  formatTimePrecise,
  parseTimePrecise,
  formatDuration,
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
import {
  computeProgramTimeline,
  getProcessedPeaksForTrack,
  getTransitionPreviewRange,
} from "@/lib/music-editor/program";
import { getTrackIndexById } from "@/lib/music-editor/history";
import type {
  AudioTrack,
  ManualEditSettings,
  ProgramTransition,
} from "@/lib/music-editor/types";
import { PROGRAM_SEGMENT_COLORS } from "@/lib/music-editor/types";

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

interface ProgramPanelProps {
  tracks: AudioTrack[];
  manualSettings: ManualEditSettings[];
  programTrackIds: string[];
  transitions: ProgramTransition[];
  programSettings: ManualEditSettings;
  isActive: boolean;
  isRendering: boolean;
  programDuration: number;
  player: PlayerApi;
  canUndo: boolean;
  canRedo: boolean;
  onActivate: () => void;
  onReorder: (ids: string[]) => void;
  onTransitionChange: (index: number, transition: ProgramTransition) => void;
  onRemoveFromProgram: (trackId: string) => void;
  onProgramSettingsChange: (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const inputClass =
  "w-full px-2 py-1 font-mono text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/5";

const btnClass =
  "px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap";

const transitionInputClass =
  "w-14 px-1.5 py-0.5 font-mono text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400";

function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

interface SortableSegmentProps {
  compact?: boolean;
  trackId: string;
  trackName: string;
  duration: number;
  colorIndex: number;
  index: number;
  onRemove: () => void;
}

function SortableSegment({
  trackId,
  trackName,
  duration,
  colorIndex,
  index,
  onRemove,
  compact = false,
}: SortableSegmentProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: trackId,
  });

  const color = PROGRAM_SEGMENT_COLORS[colorIndex % PROGRAM_SEGMENT_COLORS.length];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    borderColor: color.wave,
    backgroundColor: color.bg,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 min-w-0",
        compact ? "w-full" : "flex-shrink-0 max-w-[200px]",
      ].join(" ")}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 touch-none"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M9 5h2v2H9V5zm0 6h2v2H9v-2zm0 6h2v2H9v-2zm4-12h2v2h-2V5zm0 6h2v2h-2v-2zm0 6h2v2h-2v-2z" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-400">{index + 1}</p>
        <p className="text-[11px] font-medium truncate" style={{ color: color.label }}>
          {trackName}
        </p>
        <p className="text-[10px] text-gray-500">{formatDuration(duration)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[10px] text-red-500 hover:text-red-700 shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

interface TransitionControlProps {
  index: number;
  transition: ProgramTransition;
  onChange: (t: ProgramTransition) => void;
  onPreview: () => void;
  compact?: boolean;
}

function TransitionControl({
  index,
  transition,
  onChange,
  onPreview,
  compact = false,
}: TransitionControlProps) {
  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 w-full rounded-lg border border-purple-100 bg-purple-50/60 px-2 py-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] text-purple-600 font-medium shrink-0">↔ #{index + 1}</span>
        <select
          value={transition.type}
          onChange={(e) =>
            onChange({ ...transition, type: e.target.value as ProgramTransition["type"] })
          }
          className="flex-1 min-w-[7rem] text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
        >
          <option value="crossfade">Crossfade</option>
          <option value="none">Без перехода</option>
        </select>
        {transition.type === "crossfade" && (
          <>
            <SecondsField
              value={transition.duration}
              onChange={(duration) => onChange({ ...transition, duration })}
              min={0.5}
              max={15}
              step={0.5}
              className="w-12 px-1.5 py-0.5 text-[11px] font-mono text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400"
            />
            <button
              type="button"
              onClick={onPreview}
              className="text-[10px] text-purple-700 hover:underline whitespace-nowrap"
            >
              Слушать
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 px-1">
      <span className="text-[9px] text-purple-600 font-medium whitespace-nowrap">↔</span>
      <select
        value={transition.type}
        onChange={(e) =>
          onChange({ ...transition, type: e.target.value as ProgramTransition["type"] })
        }
        className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <option value="crossfade">Crossfade</option>
        <option value="none">Без перехода</option>
      </select>
      {transition.type === "crossfade" && (
        <>
          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <SecondsField
              value={transition.duration}
              onChange={(duration) => onChange({ ...transition, duration })}
              min={0.5}
              max={15}
              step={0.5}
              className={transitionInputClass}
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="text-[9px] text-purple-700 hover:underline whitespace-nowrap"
          >
            Слушать
          </button>
        </>
      )}
      <span className="text-[8px] text-gray-400">#{index + 1}</span>
    </div>
  );
}

export function ProgramPanel({
  tracks,
  manualSettings,
  programTrackIds,
  transitions,
  programSettings,
  isActive,
  isRendering,
  programDuration,
  player,
  canUndo,
  canRedo,
  onActivate,
  onReorder,
  onTransitionChange,
  onRemoveFromProgram,
  onProgramSettingsChange,
  onBeginGesture,
  onEndGesture,
  onUndo,
  onRedo,
}: ProgramPanelProps) {
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const isMobileLayout = useIsMobileLayout();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const timeline = useMemo(
    () => computeProgramTimeline(tracks, manualSettings, programTrackIds, transitions),
    [tracks, manualSettings, programTrackIds, transitions],
  );

  const sourceDuration = timeline.totalDuration;
  const effEnd = effectiveTrimEnd(programSettings, sourceDuration);
  const finalDuration =
    programDuration || computeResultDuration(sourceDuration, programSettings);
  const isTrimmed = finalDuration < sourceDuration - 0.5;

  const segmentPeaks = useMemo(
    () =>
      programTrackIds.map((id) => {
        const idx = getTrackIndexById(tracks, id);
        if (idx < 0) return { trackId: id, peaks: [] as number[] };
        const track = tracks[idx];
        const settings = manualSettings[idx] ?? manualSettings[0];
        return {
          trackId: id,
          peaks: getProcessedPeaksForTrack(track.peaks, track.duration, settings, 280),
        };
      }),
    [tracks, manualSettings, programTrackIds],
  );

  const playheadOnWave = useMemo(
    () =>
      isActive
        ? mapResultTimeToSource(player.currentTime, sourceDuration, programSettings)
        : 0,
    [isActive, player.currentTime, sourceDuration, programSettings],
  );

  const getPlayheadTime = useCallback(
    () =>
      isActive
        ? mapResultTimeToSource(player.currentTimeRef.current, sourceDuration, programSettings)
        : 0,
    [isActive, player.currentTimeRef, sourceDuration, programSettings],
  );

  useEffect(() => {
    if (!startFocused) setStartInput(formatTimePrecise(programSettings.trimStart));
  }, [programSettings.trimStart, sourceDuration, startFocused]);

  useEffect(() => {
    if (!endFocused) setEndInput(formatTimePrecise(effEnd));
  }, [effEnd, sourceDuration, endFocused]);

  const seekFromSourceTime = (sourceTime: number) => {
    const resultTime = mapSourceTimeToResult(sourceTime, sourceDuration, programSettings);
    player.seek(resultTime);
  };

  const playheadSource = getPlayheadSourceTime(
    player.currentTime,
    sourceDuration,
    programSettings,
  );

  const applyStartInput = () => {
    if (!startInput.trim()) {
      setStartInput(formatTimePrecise(programSettings.trimStart));
      return;
    }
    const parsed = parseTimePrecise(startInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0");
      return;
    }
    const clamped = clampTime(parsed, sourceDuration);
    if (clamped >= effEnd - 0.1) {
      setTimeError("Начало должно быть раньше конца");
      return;
    }
    setTimeError(null);
    onProgramSettingsChange({ trimStart: clamped });
  };

  const applyEndInput = () => {
    if (!endInput.trim()) {
      setEndInput(formatTimePrecise(effEnd));
      return;
    }
    const parsed = parseTimePrecise(endInput);
    if (parsed === null) {
      setTimeError("Формат: 00:00.0");
      return;
    }
    const clamped = clampTime(parsed, sourceDuration);
    if (clamped <= programSettings.trimStart + 0.1) {
      setTimeError("Конец должен быть позже начала");
      return;
    }
    setTimeError(null);
    onProgramSettingsChange({
      trimEnd: clamped >= sourceDuration - 0.05 ? null : clamped,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = programTrackIds.indexOf(String(active.id));
    const newIndex = programTrackIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(programTrackIds, oldIndex, newIndex));
  };

  const previewTransition = (index: number) => {
    const range = getTransitionPreviewRange(timeline, index);
    if (!range) return;
    const resultStart = mapSourceTimeToResult(range.start, sourceDuration, programSettings);
    player.seek(resultStart);
    player.play(resultStart);
  };

  const sliderGesture = {
    onPointerDown: onBeginGesture,
    onPointerUp: onEndGesture,
    onPointerLeave: onEndGesture,
  };

  const inactiveClass = isActive ? "" : "opacity-50 pointer-events-none";

  return (
    <section
      className={[
        "bg-white border rounded-2xl p-3 shadow-sm space-y-2 transition-all cursor-pointer min-w-0 overflow-hidden",
        isActive ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200 hover:border-gray-300",
      ].join(" ")}
      onClick={onActivate}
    >
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Программа выступления
        </p>
        <p className="text-[11px] text-gray-400">Объединённый трек — финальная обрезка и настройка</p>
      </div>

      {programTrackIds.length === 0 ? (
        <p className="text-[11px] text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-4 text-center">
          Добавьте трек кнопкой «Добавить в программу выступления» в списке файлов
        </p>
      ) : (
        <div
          className={inactiveClass}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div
              className={
                isMobileLayout
                  ? "flex flex-col gap-2 mb-2 min-w-0"
                  : "flex items-center gap-0 overflow-x-auto pb-1 mb-2 min-w-0"
              }
            >
              <SortableContext
                items={programTrackIds}
                strategy={
                  isMobileLayout ? verticalListSortingStrategy : horizontalListSortingStrategy
                }
              >
                {programTrackIds.map((id, i) => {
                  const idx = getTrackIndexById(tracks, id);
                  const track = idx >= 0 ? tracks[idx] : null;
                  const seg = timeline.segments.find((s) => s.trackId === id);
                  return (
                    <div
                      key={id}
                      className={
                        isMobileLayout ? "flex flex-col gap-1.5 w-full min-w-0" : "flex items-center"
                      }
                    >
                      {i > 0 && transitions[i - 1] && (
                        <TransitionControl
                          index={i - 1}
                          transition={transitions[i - 1]}
                          onChange={(t) => onTransitionChange(i - 1, t)}
                          onPreview={() => previewTransition(i - 1)}
                          compact={isMobileLayout}
                        />
                      )}
                      {track && seg && (
                        <SortableSegment
                          trackId={id}
                          trackName={track.name}
                          duration={seg.duration}
                          colorIndex={seg.colorIndex}
                          index={i}
                          onRemove={() => onRemoveFromProgram(id)}
                          compact={isMobileLayout}
                        />
                      )}
                    </div>
                  );
                })}
              </SortableContext>
            </div>
          </DndContext>

          {isTrimmed && isActive && (
            <p className="text-[11px] text-gray-500 mb-1.5">
              После обрезки:{" "}
              <strong className="text-gray-800">{formatTimePrecise(finalDuration)}</strong>
              <span className="text-gray-400 ml-1">(было {formatTimePrecise(sourceDuration)})</span>
            </p>
          )}

          <p className="text-[11px] text-gray-500 mb-1.5">
            Длительность:{" "}
            <strong className="text-gray-800">{formatDuration(finalDuration)}</strong>
            {isTrimmed && (
              <span className="text-gray-400 ml-1">из {formatDuration(sourceDuration)}</span>
            )}
          </p>

          <ProgramTimeline
            timeline={timeline}
            segmentPeaks={segmentPeaks}
            currentTime={playheadOnWave}
            isPlaying={isActive && player.isPlaying}
            getPlayheadTime={isActive ? getPlayheadTime : undefined}
            onSeek={seekFromSourceTime}
            trimStart={programSettings.trimStart}
            trimEnd={programSettings.trimEnd}
            duration={sourceDuration}
            height={108}
          />

          <div className="mt-2">
            <PlaybackControls
              isPlaying={player.isPlaying && isActive}
              currentTime={isActive ? player.currentTime : 0}
              duration={isActive ? player.duration || finalDuration : finalDuration}
              onPlay={() => !isRendering && isActive && player.play()}
              onPause={() => player.pause()}
              onStop={() => player.stop()}
              onSeek={(t) => isActive && player.seek(t)}
              onSkipBack={() => isActive && player.skip(-5)}
              onSkipForward={() => isActive && player.skip(5)}
              isRendering={isRendering && isActive}
            />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 space-y-2 mt-2">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onProgramSettingsChange({ trimStart: playheadSource })}
                className={btnClass}
              >
                Начало здесь
              </button>
              <button
                type="button"
                onClick={() =>
                  onProgramSettingsChange({
                    trimEnd: playheadSource >= sourceDuration - 0.05 ? null : playheadSource,
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
                onClick={() => onProgramSettingsChange({ trimStart: 0 })}
                disabled={!hasTrimStart(programSettings)}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить начало
              </button>
              <button
                type="button"
                onClick={() => onProgramSettingsChange({ trimEnd: null })}
                disabled={!hasTrimEnd(programSettings, sourceDuration)}
                className={`${btnClass} disabled:opacity-40`}
              >
                Сбросить конец
              </button>
              <button
                type="button"
                onClick={() =>
                  onProgramSettingsChange({
                    trimStart: 0,
                    trimEnd: null,
                    fadeIn: 0,
                    fadeOut: 0,
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
                    value={programSettings.fadeIn}
                    onChange={(fadeIn) =>
                      onProgramSettingsChange({ fadeIn }, { skipHistory: true })
                    }
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
                    value={programSettings.fadeOut}
                    onChange={(fadeOut) =>
                      onProgramSettingsChange({ fadeOut }, { skipHistory: true })
                    }
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

            <div>
              <label className="text-[11px] text-gray-500">
                Громкость — {Math.round(programSettings.volume * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={200}
                value={programSettings.volume * 100}
                onChange={(e) =>
                  onProgramSettingsChange(
                    { volume: Number(e.target.value) / 100 },
                    { skipHistory: true },
                  )
                }
                {...sliderGesture}
                className="w-full accent-gray-900 h-1.5 mt-0.5"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
