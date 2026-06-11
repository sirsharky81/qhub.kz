"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

interface TrackListProps {
  tracks: Track[];
  onPlay: (trackId: string) => void;
}

function TrackRow({
  track,
  isActive,
  isFavorite,
  onPlay,
  onToggleFavorite,
}: {
  track: Track;
  isActive: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors text-left ${
        isActive
          ? "bg-violet-50 dark:bg-violet-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
      }`}
    >
      <div className="w-7 h-7 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
        {track.coverArtUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.coverArtUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[10px]">🎵</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
          {track.title}
        </p>
        <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
      </div>

      <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0">
        {formatTime(track.duration)}
      </span>

      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            onToggleFavorite();
          }
        }}
        className={`w-5 h-5 flex items-center justify-center text-[10px] shrink-0 ${
          isFavorite ? "text-amber-500" : "text-gray-300"
        }`}
        aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
      >
        {isFavorite ? "★" : "☆"}
      </span>
    </button>
  );
}

export function TrackList({ tracks, onPlay }: TrackListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { currentTrack, favoriteTrackIds, toggleFavorite } = useMusicPlayer();

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 16,
  });

  if (tracks.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">Не найдено</p>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const track = tracks[item.index];
          return (
            <div
              key={track.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <TrackRow
                track={track}
                isActive={currentTrack?.id === track.id}
                isFavorite={favoriteTrackIds.has(track.id)}
                onPlay={() => onPlay(track.id)}
                onToggleFavorite={() => toggleFavorite(track.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
