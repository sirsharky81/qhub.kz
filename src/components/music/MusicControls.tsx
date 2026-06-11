"use client";

import { useMusicPlayerOptional } from "@/contexts/MusicPlayerContext";
import { AudioEqualizer } from "./AudioEqualizer";

interface MusicControlsProps {
  compact?: boolean;
  showEqualizer?: boolean;
}

export function MusicControls({ compact = false, showEqualizer = true }: MusicControlsProps) {
  const player = useMusicPlayerOptional();
  if (!player?.currentTrack) return null;

  const { currentTrack, status, togglePlay, previous, next, analyser } = player;
  const isPlaying = status === "playing";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {showEqualizer && (
          <AudioEqualizer
            analyser={analyser}
            isPlaying={isPlaying}
            barCount={12}
            className="w-16 h-6 hidden sm:block"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void previous();
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Предыдущий"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void togglePlay();
          }}
          className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs"
          aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void next();
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Следующий"
        >
          ⏭
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {showEqualizer && (
        <AudioEqualizer
          analyser={analyser}
          isPlaying={isPlaying}
          className="w-full max-w-xs h-12"
        />
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void previous()}
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Предыдущий"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="w-14 h-14 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center text-xl shadow-lg hover:opacity-90 transition-opacity"
          aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => void next()}
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Следующий"
        >
          ⏭
        </button>
      </div>
      <p className="text-xs text-gray-400 truncate max-w-full">
        {currentTrack.title} — {currentTrack.artist}
      </p>
    </div>
  );
}
