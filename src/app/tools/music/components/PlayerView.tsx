"use client";

import { useEffect, useState } from "react";
import { AudioDebugPanel } from "@/components/music/AudioDebugPanel";
import { AudioEqualizer } from "@/components/music/AudioEqualizer";
import { SeekBar } from "@/components/music/SeekBar";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { PlayerControls } from "./PlayerControls";

export function PlayerView() {
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("debug=1")) {
      sessionStorage.setItem("qhub-debug", "1");
    }
    setShowDebug(
      window.location.search.includes("debug=1") ||
        sessionStorage.getItem("qhub-debug") === "1",
    );
  }, []);

  const {
    currentTrack,
    status,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    analyser,
    getLiveTime,
    togglePlay,
    previous,
    next,
    stop,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    favoriteTrackIds,
  } = useMusicPlayer();

  const isPlaying = status === "playing";

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl mb-3">
          🎵
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Выберите трек</p>
        <p className="text-xs text-gray-400 mt-1">или добавьте музыку</p>
      </div>
    );
  }

  const isFavorite = favoriteTrackIds.has(currentTrack.id);

  return (
    <div className="flex flex-col h-full p-3 sm:p-4 max-w-lg mx-auto w-full justify-start">
      {/* Now playing card */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col">
        <div className="flex gap-3 items-start shrink-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 shadow-sm">
            {currentTrack.coverArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentTrack.coverArtUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">
                  {currentTrack.title}
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {currentTrack.artist}
                </p>
                {currentTrack.album && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {currentTrack.album}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm transition-colors ${
                  isFavorite
                    ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30"
                    : "text-gray-300 hover:text-amber-400"
                }`}
                aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
              >
                {isFavorite ? "★" : "☆"}
              </button>
            </div>

            <AudioEqualizer
              analyser={analyser}
              isPlaying={isPlaying}
              barCount={20}
              className="w-full h-6 mt-2"
            />
          </div>
        </div>

        <div className="mt-3 shrink-0">
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onSeek={seek}
            getLiveTime={getLiveTime}
            compact
          />
        </div>

        <div className="mt-2 shrink-0">
          <PlayerControls
            isPlaying={isPlaying}
            shuffle={shuffle}
            repeat={repeat}
            volume={volume}
            onTogglePlay={() => void togglePlay()}
            onPrevious={() => void previous()}
            onNext={() => void next()}
            onStop={stop}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeat}
            onVolumeChange={setVolume}
          />
        </div>

        <AudioDebugPanel enabled={showDebug} />
      </div>
    </div>
  );
}
