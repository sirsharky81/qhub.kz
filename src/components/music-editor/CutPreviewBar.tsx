"use client";

import { formatTimePrecise } from "@/lib/music-editor/format";

interface CutPreviewBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectionLabel: string;
  resultLabel: string;
  busy: boolean;
  canSave: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
  onSave: () => void;
}

export function CutPreviewBar({
  isPlaying,
  currentTime,
  duration,
  selectionLabel,
  resultLabel,
  busy,
  canSave,
  onPlay,
  onPause,
  onSeek,
  onClose,
  onSave,
}: CutPreviewBarProps) {
  return (
    <div className="fixed inset-x-3 z-40 rounded-2xl border border-gray-900 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.22)] bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:inset-auto md:z-20 md:mt-2 md:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Результат
          </p>
          <p className="text-[11px] text-gray-700 mt-0.5">
            Без {selectionLabel} · <span className="font-mono">{resultLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          Закрыть
        </button>
      </div>

      {busy && (
        <p className="text-[11px] text-amber-600 text-center mt-2">Готовим звук без участка…</p>
      )}

      <div className="flex items-center gap-2 mt-2">
        {isPlaying ? (
          <button
            type="button"
            onClick={onPause}
            className="w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 shrink-0"
            aria-label="Пауза"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 shrink-0"
            aria-label="Воспроизвести результат"
          >
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            disabled={busy || duration <= 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5"
            aria-label="Время результата"
          />
          <div className="flex justify-between font-mono text-[10px] text-gray-500 mt-0.5">
            <span>{formatTimePrecise(currentTime)}</span>
            <span>{formatTimePrecise(duration)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={!canSave || busy}
        className="w-full mt-2 py-2 rounded-xl bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800 disabled:opacity-40"
      >
        Сохранить вырез
      </button>
    </div>
  );
}
