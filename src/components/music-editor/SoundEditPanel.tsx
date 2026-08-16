"use client";

import { useEffect, useMemo, useState } from "react";
import { EQ_BANDS, EQ_PRESETS } from "@/lib/music-editor/eq";
import {
  describeEditRegion,
  findRegionForLoop,
  upsertEditRegion,
} from "@/lib/music-editor/selection";
import { formatTimeMs } from "@/lib/music-editor/format";
import {
  bpmFromPlaybackRate,
  clampEqGain,
  clampPlaybackRate,
  cloneEq,
  DEFAULT_SOURCE_BPM,
  FLAT_EQ,
  isFlatEq,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_PRESETS,
  playbackRateFromBpm,
  type EqSettings,
  type ManualEditSettings,
  type TrimRegion,
} from "@/lib/music-editor/types";

export type SoundScope = "track" | "selection";

const btnClass =
  "px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap";

const sectionLabel = "text-[10px] font-semibold text-gray-500 uppercase tracking-wider";

interface SoundDraft {
  playbackRate: number;
  volume: number;
  eq: EqSettings;
}

function draftFromSettings(settings: ManualEditSettings): SoundDraft {
  return {
    playbackRate: clampPlaybackRate(settings.playbackRate ?? 1),
    volume: settings.volume,
    eq: cloneEq(settings.eq ?? FLAT_EQ),
  };
}

function draftFromRegion(region: { playbackRate: number; volume: number; eq: EqSettings }): SoundDraft {
  return {
    playbackRate: clampPlaybackRate(region.playbackRate),
    volume: region.volume,
    eq: cloneEq(region.eq),
  };
}

function formatBpm(bpm: number): string {
  const rounded = Math.round(bpm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function SpeedSlider({
  value,
  onChange,
  onBeginGesture,
  onEndGesture,
  sourceBpm = null,
}: {
  value: number;
  onChange: (rate: number, opts?: { skipHistory?: boolean }) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  sourceBpm?: number | null;
}) {
  const percent = Math.round(value * 100);
  const source = sourceBpm && sourceBpm > 0 ? sourceBpm : DEFAULT_SOURCE_BPM;
  const assumedSource = !(sourceBpm && sourceBpm > 0);
  const targetBpm = bpmFromPlaybackRate(source, value);
  const [bpmInput, setBpmInput] = useState("");
  const [bpmFocused, setBpmFocused] = useState(false);

  useEffect(() => {
    if (!bpmFocused) setBpmInput(formatBpm(targetBpm));
  }, [targetBpm, bpmFocused]);

  const applyTargetBpm = (raw: string) => {
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setBpmInput(formatBpm(targetBpm));
      return;
    }
    onChange(playbackRateFromBpm(source, parsed));
  };

  const nudgeBpm = (delta: number) => {
    const next = Math.round(targetBpm) + delta;
    onChange(playbackRateFromBpm(source, next));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-500">
          Скорость — {value.toFixed(2)}× ({percent}%)
        </label>
        {Math.abs(value - 1) > 0.001 && (
          <button
            type="button"
            className={`${btnClass} text-[10px]`}
            onClick={() => onChange(1)}
          >
            1.00×
          </button>
        )}
      </div>
      <input
        type="range"
        min={50}
        max={200}
        step={1}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100, { skipHistory: true })}
        onPointerDown={onBeginGesture}
        onPointerUp={onEndGesture}
        onPointerLeave={onEndGesture}
        className="w-full accent-amber-600 h-1.5"
        aria-label="Скорость воспроизведения"
      />
      <div className="flex flex-wrap gap-1">
        {PLAYBACK_RATE_PRESETS.map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => onChange(rate)}
            className={[
              btnClass,
              Math.abs(value - rate) < 0.001 ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700" : "",
            ].join(" ")}
          >
            {rate.toFixed(2)}×
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[11px] text-gray-500">
          {formatBpm(source)} →
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={bpmInput}
          onChange={(e) => setBpmInput(e.target.value.replace(/[^\d.,]/g, ""))}
          onFocus={() => setBpmFocused(true)}
          onBlur={() => {
            setBpmFocused(false);
            applyTargetBpm(bpmInput);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-14 px-1.5 py-1 font-mono text-[11px] text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400"
          aria-label="Целевой BPM"
        />
        <span className="text-[11px] text-gray-500">BPM</span>
        <button type="button" className={btnClass} onClick={() => nudgeBpm(-1)}>
          BPM −
        </button>
        <button type="button" className={btnClass} onClick={() => nudgeBpm(1)}>
          BPM +
        </button>
        <span className="text-[10px] text-gray-400">
          {formatBpm(source * MIN_PLAYBACK_RATE)}–{formatBpm(source * MAX_PLAYBACK_RATE)}
        </span>
        {assumedSource && (
          <span className="text-[10px] text-gray-400 w-full">
            Пока нет анализа, исходный темп считается 120. «Определить BPM» в блоке «Ритм» уточнит сетку, не скорость.
          </span>
        )}
      </div>
    </div>
  );
}

export function EqEditor({
  eq,
  onChange,
  onBeginGesture,
  onEndGesture,
  label = "Эквалайзер",
}: {
  eq: EqSettings;
  onChange: (eq: EqSettings, opts?: { skipHistory?: boolean }) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">{label}</p>
        <button
          type="button"
          onClick={() => onChange(cloneEq(FLAT_EQ))}
          disabled={isFlatEq(eq)}
          className={`${btnClass} disabled:opacity-40`}
        >
          Сброс эквалайзера
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {EQ_BANDS.map((band) => (
          <label key={band.key} className="flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] font-mono text-gray-500 tabular-nums">
              {eq[band.key] > 0 ? "+" : ""}
              {eq[band.key]}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={eq[band.key]}
              onChange={(e) =>
                onChange(
                  { ...eq, [band.key]: clampEqGain(Number(e.target.value)) },
                  { skipHistory: true },
                )
              }
              onPointerDown={onBeginGesture}
              onPointerUp={onEndGesture}
              onPointerLeave={onEndGesture}
              className="h-20 w-7 accent-amber-600 cursor-pointer"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
              aria-label={`${band.label} ${band.hz} Гц`}
            />
            <span className="text-[9px] font-medium text-gray-700 text-center leading-tight">
              {band.label}
            </span>
            <span className="text-[8px] text-gray-400">{band.hz}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {EQ_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(cloneEq(preset.eq))}
            className={btnClass}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SoundEditPanelProps {
  settings: ManualEditSettings;
  loopRegion: TrimRegion | null;
  sourceBpm?: number | null;
  onSettingsChange: (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
}

export function SoundEditPanel({
  settings,
  loopRegion,
  sourceBpm = null,
  onSettingsChange,
  onBeginGesture,
  onEndGesture,
}: SoundEditPanelProps) {
  const [scope, setScope] = useState<SoundScope>("track");
  const [draft, setDraft] = useState<SoundDraft>(() => draftFromSettings(settings));

  const matching = useMemo(
    () => findRegionForLoop(settings.editRegions ?? [], loopRegion),
    [settings.editRegions, loopRegion],
  );

  useEffect(() => {
    if (scope !== "selection") return;
    if (matching) setDraft(draftFromRegion(matching));
    else setDraft(draftFromSettings(settings));
  }, [scope, matching, loopRegion?.start, loopRegion?.end, settings]);

  useEffect(() => {
    if (scope === "track") setDraft(draftFromSettings(settings));
  }, [scope, settings.playbackRate, settings.volume, settings.eq]);

  const current = scope === "track" ? draftFromSettings(settings) : draft;
  const canApplySelection = Boolean(loopRegion && loopRegion.end - loopRegion.start >= 0.05);

  const commit = (
    patch: Partial<SoundDraft>,
    opts?: { skipHistory?: boolean },
  ) => {
    const next: SoundDraft = {
      playbackRate: clampPlaybackRate(patch.playbackRate ?? current.playbackRate),
      volume: patch.volume ?? current.volume,
      eq: patch.eq ? cloneEq(patch.eq) : current.eq,
    };

    if (scope === "track") {
      onSettingsChange(
        { playbackRate: next.playbackRate, volume: next.volume, eq: next.eq },
        opts,
      );
      return;
    }

    setDraft(next);
    if (!matching) return;
    const regions = (settings.editRegions ?? []).map((r) =>
      Math.abs(r.start - matching.start) < 0.001 && Math.abs(r.end - matching.end) < 0.001
        ? { ...r, playbackRate: next.playbackRate, volume: next.volume, eq: cloneEq(next.eq) }
        : r,
    );
    onSettingsChange({ editRegions: regions }, opts);
  };

  const applyToSelection = () => {
    if (!loopRegion || !canApplySelection) return;
    onBeginGesture();
    onSettingsChange({
      editRegions: upsertEditRegion(settings.editRegions ?? [], {
        start: loopRegion.start,
        end: loopRegion.end,
        playbackRate: current.playbackRate,
        volume: current.volume,
        eq: cloneEq(current.eq),
      }),
    });
    onEndGesture();
  };

  const removeRegion = (index: number) => {
    onSettingsChange({
      editRegions: (settings.editRegions ?? []).filter((_, i) => i !== index),
    });
  };

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className={sectionLabel}>Звук</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setScope("track")}
            className={[
              "px-2 py-1 text-[11px] font-medium",
              scope === "track" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
            ].join(" ")}
          >
            Весь трек
          </button>
          <button
            type="button"
            onClick={() => setScope("selection")}
            className={[
              "px-2 py-1 text-[11px] font-medium border-l border-gray-200",
              scope === "selection" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
            ].join(" ")}
          >
            Выделение
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-400">
        BPM ± меняет скорость, не позицию. Перемотка — кнопки «−100ms / +100ms» под плеером.
      </p>

      {scope === "selection" && !loopRegion && (
        <p className="text-[11px] text-amber-800">
          Выделите участок на волне (начало/конец loop), затем примените скорость, EQ или громкость.
        </p>
      )}

      <SpeedSlider
        value={current.playbackRate}
        onChange={(playbackRate, opts) => commit({ playbackRate }, opts)}
        onBeginGesture={onBeginGesture}
        onEndGesture={onEndGesture}
        sourceBpm={sourceBpm}
      />

      <EqEditor
          eq={current.eq}
          onChange={(eq, opts) => commit({ eq }, opts)}
          onBeginGesture={onBeginGesture}
          onEndGesture={onEndGesture}
        />

      <div>
        <label className="text-[11px] text-gray-500">
          Громкость — {Math.round(current.volume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(current.volume * 100)}
          onChange={(e) => commit({ volume: Number(e.target.value) / 100 }, { skipHistory: true })}
          onPointerDown={onBeginGesture}
          onPointerUp={onEndGesture}
          onPointerLeave={onEndGesture}
          className="w-full accent-gray-900 h-1.5 mt-0.5"
          aria-label="Громкость"
        />
      </div>

      {scope === "selection" && (
        <button
          type="button"
          onClick={applyToSelection}
          disabled={!canApplySelection}
          className={`${btnClass} w-full bg-amber-600 text-white border-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:bg-white disabled:text-gray-400 disabled:border-gray-200`}
        >
          Применить к участку
        </button>
      )}

      {(settings.editRegions ?? []).length > 0 && (
        <ul className="space-y-1">
          {settings.editRegions.map((region, i) => (
            <li
              key={`${region.start}-${region.end}-${i}`}
              className="flex items-center justify-between gap-2 text-[11px] font-mono text-amber-800 bg-amber-50 rounded-lg px-2 py-1"
            >
              <span>
                {describeEditRegion(region)} · {formatTimeMs(region.start)} – {formatTimeMs(region.end)}
              </span>
              <button
                type="button"
                onClick={() => removeRegion(i)}
                className="text-amber-600 hover:text-amber-900 shrink-0"
                aria-label="Убрать правку участка"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
