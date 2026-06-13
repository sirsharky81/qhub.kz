"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import { SwipeableRow } from "@/components/music/SwipeableRow";
import { ConfirmDialog } from "@/components/music/ConfirmDialog";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { PlaylistPickerDialog } from "@/components/music/PlaylistPickerDialog";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useWideLayout } from "@/hooks/useWideLayout";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

interface TrackListProps {
  tracks: Track[];
  onPlay: (trackId: string) => void;
}

function TrackContextMenu({
  track,
  onClose,
  onPlayNow,
  onAddToQueue,
  onAddToPlaylist,
  onSelect,
  onDelete,
  showDesktopActions,
}: {
  track: Track;
  onClose: () => void;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: () => void;
  onSelect: () => void;
  onDelete: () => void;
  showDesktopActions: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[120]" onClick={onClose} />
      <div className="fixed left-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] -translate-x-1/2 z-[121] w-[min(90vw,280px)] rounded-2xl bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{track.title}</p>
          <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
        </div>
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              onPlayNow();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Играть сейчас
          </button>
          <button
            type="button"
            onClick={() => {
              onAddToQueue();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Добавить в очередь
          </button>
          <button
            type="button"
            onClick={() => {
              onAddToPlaylist();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Добавить в плейлист
          </button>
          {showDesktopActions ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onSelect();
                  onClose();
                }}
                className="w-full px-4 py-2.5 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Выделить
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="w-full px-4 py-2.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Удалить из медиатеки
              </button>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500"
        >
          Отмена
        </button>
      </div>
    </>
  );
}

function TrackRow({
  track,
  isActive,
  isFavorite,
  isTouch,
  isWideLayout,
  isSelectionMode,
  isSelected,
  unavailable,
  onPlay,
  onToggleFavorite,
  onDelete,
  onLongPress,
  onToggleSelect,
  onCtrlSelect,
}: {
  track: Track;
  isActive: boolean;
  isFavorite: boolean;
  isTouch: boolean;
  isWideLayout: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  unavailable: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  onCtrlSelect: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowBg = isActive ? "bg-gray-100 dark:bg-gray-800" : "bg-white dark:bg-gray-900";

  const handleTouchStart = () => {
    if (!isTouch || isSelectionMode) return;
    longPressTimer.current = setTimeout(onLongPress, 500);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const rowInner = (
    <div
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${rowBg} ${
        unavailable ? "opacity-50" : ""
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
      onContextMenu={(e) => {
        if (!isWideLayout) return;
        e.preventDefault();
        onLongPress();
      }}
    >
      {isSelectionMode ? (
        <button
          type="button"
          onClick={onToggleSelect}
          className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] shrink-0 ${
            isSelected
              ? "bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900"
              : "border-gray-300 dark:border-gray-600 text-transparent"
          }`}
          aria-label={isSelected ? "Снять выделение" : "Выделить"}
        >
          ✓
        </button>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          if (isWideLayout && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onCtrlSelect();
            return;
          }
          if (isSelectionMode) onToggleSelect();
          else onPlay();
        }}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <TrackArtwork coverArtUrl={track.coverArtUrl} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate leading-tight flex items-center gap-1">
            {unavailable ? (
              <>
                <span className="text-amber-500 shrink-0">⚠</span>
                <span className="truncate">{track.title}</span>
              </>
            ) : (
              track.title
            )}
          </p>
          <p className="text-[10px] text-gray-400 truncate">
            {unavailable ? "Файл недоступен" : track.artist}
          </p>
        </div>
      </button>

      <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0">
        {formatTime(track.duration)}
      </span>

      {!isSelectionMode ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`w-5 h-5 flex items-center justify-center text-[10px] shrink-0 ${
            isFavorite ? "text-gray-900 dark:text-gray-100" : "text-gray-300"
          }`}
          aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      ) : null}

      {isWideLayout && !isSelectionMode ? (
        <button
          type="button"
          onClick={onDelete}
          className="w-5 h-5 flex items-center justify-center text-[10px] text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded shrink-0"
          aria-label="Удалить из медиатеки"
        >
          ✕
        </button>
      ) : null}
    </div>
  );

  if (!isTouch || isSelectionMode) return rowInner;

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
  const isWideLayout = useWideLayout();
  const {
    currentTrack,
    favoriteTrackIds,
    toggleFavorite,
    removeTrackFromLibrary,
    addToQueue,
    addTracksToQueue,
    isTrackUnavailable,
  } = useMusicPlayer();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextTrack, setContextTrack] = useState<Track | null>(null);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; title: string } | null>(null);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 16,
  });

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(tracks.map((t) => t.id)));
  const selectNone = () => setSelectedIds(new Set());

  const openPlaylistPicker = (ids: string[]) => {
    setPlaylistTrackIds(ids);
    setPlaylistPickerOpen(true);
  };

  const requestDelete = useCallback(
    (ids: string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) return;

      const title =
        uniqueIds.length === 1
          ? `Удалить «${tracks.find((t) => t.id === uniqueIds[0])?.title ?? "трек"}» из медиатеки?`
          : `Удалить ${uniqueIds.length} треков из медиатеки?`;

      setDeleteConfirm({ ids: uniqueIds, title });
    },
    [tracks],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    for (const id of deleteConfirm.ids) {
      await removeTrackFromLibrary(id);
    }
    setDeleteConfirm(null);
    exitSelection();
  }, [deleteConfirm, removeTrackFromLibrary, exitSelection]);

  const enterSelectionWith = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const ctrlSelect = useCallback(
    (id: string) => {
      if (!selectionMode) {
        enterSelectionWith(id);
        return;
      }
      toggleSelect(id);
    },
    [selectionMode, enterSelectionWith, toggleSelect],
  );

  if (tracks.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">Не найдено</p>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {selectionMode ? (
        <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <span className="text-[10px] text-gray-500 flex-1">{selectedIds.size} выбрано</span>
          <button type="button" onClick={selectAll} className="px-2 py-0.5 text-[10px] text-gray-600 dark:text-gray-400">
            Всё
          </button>
          <button type="button" onClick={selectNone} className="px-2 py-0.5 text-[10px] text-gray-600 dark:text-gray-400">
            Снять
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => {
              addTracksToQueue(Array.from(selectedIds));
              exitSelection();
            }}
            className="px-2 py-0.5 text-[10px] font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded disabled:opacity-40"
          >
            + Q
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => openPlaylistPicker(Array.from(selectedIds))}
            className="px-2 py-0.5 text-[10px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded disabled:opacity-40"
          >
            + PL
          </button>
          {isWideLayout ? (
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => requestDelete(Array.from(selectedIds))}
              className="px-2 py-0.5 text-[10px] font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded disabled:opacity-40"
            >
              Удалить
            </button>
          ) : null}
          <button type="button" onClick={exitSelection} className="px-2 py-0.5 text-[10px] text-gray-500">
            ✕
          </button>
        </div>
      ) : null}

      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
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
                  isWideLayout={isWideLayout}
                  isSelectionMode={selectionMode}
                  isSelected={selectedIds.has(track.id)}
                  unavailable={isTrackUnavailable(track.id)}
                  onPlay={() => onPlay(track.id)}
                  onToggleFavorite={() => toggleFavorite(track.id)}
                  onDelete={() => requestDelete([track.id])}
                  onLongPress={() => {
                    if (selectionMode) return;
                    if (isTouch) {
                      setSelectionMode(true);
                      setSelectedIds(new Set([track.id]));
                    } else {
                      setContextTrack(track);
                    }
                  }}
                  onToggleSelect={() => toggleSelect(track.id)}
                  onCtrlSelect={() => ctrlSelect(track.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {contextTrack ? (
        <TrackContextMenu
          track={contextTrack}
          showDesktopActions={isWideLayout}
          onClose={() => setContextTrack(null)}
          onPlayNow={() => onPlay(contextTrack.id)}
          onAddToQueue={() => addToQueue(contextTrack.id)}
          onAddToPlaylist={() => openPlaylistPicker([contextTrack.id])}
          onSelect={() => enterSelectionWith(contextTrack.id)}
          onDelete={() => requestDelete([contextTrack.id])}
        />
      ) : null}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirm?.title ?? ""}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteConfirm(null)}
      />

      <PlaylistPickerDialog
        open={playlistPickerOpen}
        trackIds={playlistTrackIds}
        onClose={() => {
          setPlaylistPickerOpen(false);
          exitSelection();
        }}
      />
    </div>
  );
}
