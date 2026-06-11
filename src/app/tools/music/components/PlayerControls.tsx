"use client";

import type { CSSProperties } from "react";

const btnSm =
  "w-7 h-7 rounded-full border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-40";

const btnActive =
  "w-7 h-7 rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-300";

interface PlayerControlsProps {
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  volume: number;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onVolumeChange: (v: number) => void;
}

export function PlayerControls({
  isPlaying,
  shuffle,
  repeat,
  volume,
  onTogglePlay,
  onPrevious,
  onNext,
  onStop,
  onToggleShuffle,
  onCycleRepeat,
  onVolumeChange,
}: PlayerControlsProps) {
  const repeatIcon = (
    <span className="relative flex items-center justify-center">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
      </svg>
      {repeat === "one" && (
        <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold leading-none">1</span>
      )}
    </span>
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-2 pt-2 pb-1 space-y-1.5">
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={shuffle ? btnActive : btnSm}
          aria-label="Перемешать"
          aria-pressed={shuffle}
          title="Перемешать"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
          </svg>
        </button>

        <button type="button" onClick={onPrevious} className={btnSm} aria-label="Предыдущий">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center hover:opacity-90 transition-opacity mx-0.5"
          aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button type="button" onClick={onNext} className={btnSm} aria-label="Следующий">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onCycleRepeat}
          className={repeat !== "none" ? btnActive : btnSm}
          aria-label="Повтор"
          aria-pressed={repeat !== "none"}
          title={repeat === "one" ? "Повтор одного" : repeat === "all" ? "Повтор всех" : "Без повтора"}
        >
          {repeatIcon}
        </button>

        <span className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-0.5" />

        <button type="button" onClick={onStop} className={btnSm} aria-label="Стоп">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 px-1 pb-0.5 touch-none min-h-[36px]">
        <svg className="w-3 h-3 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onInput={(e) => onVolumeChange(Number(e.currentTarget.value))}
          style={{ "--vol-pct": `${Math.round(volume * 100)}%` } as CSSProperties}
          className="music-volume-slider flex-1 min-w-0 h-8 cursor-pointer touch-manipulation"
          aria-label="Громкость"
        />
        <span className="text-[10px] font-mono text-gray-400 w-7 text-right tabular-nums shrink-0">
          {Math.round(volume * 100)}
        </span>
      </div>
    </div>
  );
}
