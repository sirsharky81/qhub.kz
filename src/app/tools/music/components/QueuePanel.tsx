"use client";

import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { formatTime } from "@/lib/music/types";

export function QueuePanel() {
  const { queue, queueIndex, tracks, playTrack, removeFromQueue } = useMusicPlayer();

  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Очередь
        </h3>
        <span className="text-[10px] text-gray-400 font-mono">{queue.length}</span>
      </div>

      <div className="flex-1 overflow-auto py-0.5">
        {queue.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Пусто</p>
        ) : (
          queue.map((id, index) => {
            const track = trackMap.get(id);
            if (!track) return null;
            const isActive = index === queueIndex;

            return (
              <div
                key={`${id}-${index}`}
                className={`flex items-center gap-1.5 px-2 py-1 transition-colors ${
                  isActive
                    ? "bg-violet-50 dark:bg-violet-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                }`}
              >
                <span className="text-[9px] text-gray-400 font-mono w-4 text-center shrink-0">
                  {isActive ? "▶" : index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => void playTrack(id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-[11px] text-gray-900 dark:text-gray-100 truncate leading-tight">
                    {track.title}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                </button>
                <span className="text-[9px] text-gray-400 font-mono shrink-0 hidden lg:block">
                  {formatTime(track.duration)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFromQueue(id)}
                  className="w-5 h-5 rounded text-gray-300 hover:text-red-500 flex items-center justify-center text-[10px] shrink-0"
                  aria-label="Убрать"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
