"use client";

import { PlaybackControls } from "./AudioPlayer";

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
  onStop: () => void;
  onSeek: (time: number) => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
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
  onStop,
  onSeek,
  onSkipBack,
  onSkipForward,
  onClose,
  onSave,
}: CutPreviewBarProps) {
  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-2 rounded-2xl border border-gray-900 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Результат — без сохранения
          </p>
          <p className="text-[11px] text-gray-700 mt-0.5">
            Пропуск {selectionLabel}. Длина: <span className="font-mono">{resultLabel}</span>
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
      <PlaybackControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
        onSeek={onSeek}
        onSkipBack={onSkipBack}
        onSkipForward={onSkipForward}
        isRendering={busy}
      />
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave || busy}
        className="w-full py-2 rounded-xl bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800 disabled:opacity-40"
      >
        Сохранить вырез
      </button>
    </div>
  );
}
