"use client";

import { useMemo, useState } from "react";
import { SwipeableRow } from "@/components/music/SwipeableRow";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { NameInputDialog } from "@/components/music/NameInputDialog";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import type { Playlist } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

export function PlaylistsPanel() {
  const {
    playlists,
    tracks,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    playPlaylist,
    addTracksToQueue,
    removeTrackFromPlaylist,
    isTrackUnavailable,
  } = useMusicPlayer();

  const isTouch = useCoarsePointer();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const selected = playlists.find((p) => p.id === selectedId) ?? null;

  if (creating) {
    return (
      <NameInputDialog
        open
        title="Новый плейлист"
        placeholder="Название плейлиста"
        confirmLabel="Создать"
        onCancel={() => setCreating(false)}
        onConfirm={async (name) => {
          await createPlaylist(name, []);
          setCreating(false);
        }}
      />
    );
  }

  if (renaming) {
    return (
      <NameInputDialog
        open
        title="Переименовать плейлист"
        initialValue={renaming.name}
        onCancel={() => setRenaming(null)}
        onConfirm={async (name) => {
          await renamePlaylist(renaming.id, name);
          setRenaming(null);
        }}
      />
    );
  }

  if (selected) {
    const playlistTracks = selected.trackIds
      .map((id) => trackMap.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t);

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-shrink-0 px-2 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
            >
              ←
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                {selected.name}
              </h3>
              <p className="text-[10px] text-gray-400">{playlistTracks.length} треков</p>
            </div>
            <button
              type="button"
              onClick={() => void playPlaylist(selected.id)}
              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => addTracksToQueue(selected.trackIds)}
              className="px-2 py-1 rounded-lg text-[10px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            >
              + Q
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto py-0.5">
          {playlistTracks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Плейлист пуст</p>
          ) : (
            playlistTracks.map((track) => {
              const unavailable = isTrackUnavailable(track.id);
              const row = (
                <div
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                    unavailable ? "opacity-50" : ""
                  }`}
                >
                  <TrackArtwork coverArtUrl={track.coverArtUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate">
                      {track.title}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {unavailable ? "Файл недоступен" : track.artist}
                    </p>
                  </div>
                  <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0">
                    {formatTime(track.duration)}
                  </span>
                  {!isTouch ? (
                    <button
                      type="button"
                      onClick={() => void removeTrackFromPlaylist(selected.id, track.id)}
                      className="w-5 h-5 text-[10px] text-gray-300 hover:text-red-500 shrink-0"
                      aria-label="Убрать из плейлиста"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              );

              if (!isTouch) return <div key={track.id}>{row}</div>;

              return (
                <SwipeableRow
                  key={track.id}
                  actions={[
                    {
                      id: "remove",
                      label: "Удалить",
                      className: "bg-red-600 text-white",
                      confirm: false,
                      onAction: () => void removeTrackFromPlaylist(selected.id, track.id),
                    },
                  ]}
                >
                  {row}
                </SwipeableRow>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-2 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Плейлисты
        </h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900"
        >
          + Создать
        </button>
      </div>

      <div className="flex-1 overflow-auto py-0.5">
        {playlists.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="text-xs text-gray-400">Нет плейлистов</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            >
              Создать плейлист
            </button>
          </div>
        ) : (
          playlists.map((pl) => {
            const row = (
              <button
                type="button"
                onClick={() => setSelectedId(pl.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-sm shrink-0">
                  ♫
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{pl.name}</p>
                  <p className="text-[10px] text-gray-400">{pl.trackIds.length} треков</p>
                </div>
              </button>
            );

            if (!isTouch) {
              return (
                <div key={pl.id} className="group relative">
                  {row}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming(pl);
                      }}
                      className="px-1.5 py-0.5 text-[9px] rounded border border-gray-200 dark:border-gray-700 text-gray-500"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePlaylist(pl.id);
                      }}
                      className="px-1.5 py-0.5 text-[9px] rounded border border-red-200 text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <SwipeableRow
                key={pl.id}
                actions={[
                  {
                    id: "rename",
                    label: "✎",
                    className: "bg-gray-700 text-white",
                    confirm: false,
                    onAction: () => setRenaming(pl),
                  },
                  {
                    id: "delete",
                    label: "Удалить",
                    className: "bg-red-600 text-white",
                    confirm: false,
                    onAction: () => void deletePlaylist(pl.id),
                  },
                ]}
              >
                {row}
              </SwipeableRow>
            );
          })
        )}
      </div>
    </div>
  );
}
