"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { SwipeableRow } from "@/components/music/SwipeableRow";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
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
  isTouch,
  onPlay,
  onToggleFavorite,
  onDelete,
}: {
  track: Track;
  isActive: boolean;
  isFavorite: boolean;
  isTouch: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const rowBg = isActive ? "bg-gray-100" : "bg-white";

  const rowInner = (
    <div className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${rowBg}`}>
      <button type="button" onClick={onPlay} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <TrackArtwork coverArtUrl={track.coverArtUrl} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-900 truncate leading-tight">{track.title}</p>
          <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
        </div>
      </button>

      <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0">
        {formatTime(track.duration)}
      </span>

      <button
        type="button"
        onClick={onToggleFavorite}
        className={`w-5 h-5 flex items-center justify-center text-[10px] shrink-0 ${
          isFavorite ? "text-gray-900" : "text-gray-300"
        }`}
        aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
      >
        {isFavorite ? "★" : "☆"}
      </button>

      {!isTouch ? (
        <button
          type="button"
          onClick={onDelete}
          className="w-5 h-5 flex items-center justify-center text-[10px] text-gray-300 hover:text-red-500 hover:bg-red-50 rounded shrink-0"
          aria-label="Удалить из медиатеки"
        >
          ✕
        </button>
      ) : null}
    </div>
  );

  if (!isTouch) return rowInner;

  return (
    <SwipeableRow
      contentClassName={rowBg}
      actions={[
        {
          id: "delete",
          label: "Удалить",
          className: "bg-red-600 text-white",
          confirmTitle: `Удалить «${track.title}» из медиатеки?`,
          onAction: onDelete,
        },
      ]}
    >
      {rowInner}
    </SwipeableRow>
  );
}

export function TrackList({ tracks, onPlay }: TrackListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isTouch = useCoarsePointer();
  const { currentTrack, favoriteTrackIds, toggleFavorite, removeTrackFromLibrary } = useMusicPlayer();

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
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
                isTouch={isTouch}
                onPlay={() => onPlay(track.id)}
                onToggleFavorite={() => toggleFavorite(track.id)}
                onDelete={() => {
                  if (window.confirm(`Удалить «${track.title}» из медиатеки?`)) {
                    void removeTrackFromLibrary(track.id);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
