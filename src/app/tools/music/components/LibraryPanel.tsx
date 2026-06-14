"use client";

import { useMemo } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import * as mediaLibrary from "@/lib/music/media-library";
import type { LibraryTab, SortDirection, SortField, UnavailableFilter } from "@/lib/music/types";
import { TrackList } from "./TrackList";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "tracks", label: "Треки" },
  { id: "albums", label: "Альбомы" },
  { id: "artists", label: "Артисты" },
  { id: "favorites", label: "★" },
  { id: "folders", label: "Папки" },
];

const tabClass = (active: boolean) =>
  `px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
    active
      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
  }`;

export function LibraryPanel() {
  const {
    libraryTab,
    setLibraryTab,
    searchQuery,
    setSearchQuery,
    sortField,
    sortDirection,
    setSort,
    filteredTracks,
    tracks,
    playTrack,
    playAlbum,
    unavailableFilter,
    setUnavailableFilter,
    unavailableTrackIds,
    removeAllUnavailableFromLibrary,
  } = useMusicPlayer();

  const baseFiltered = useMemo(
    () => mediaLibrary.filterTracks(tracks, searchQuery),
    [tracks, searchQuery],
  );

  const albums = useMemo(() => mediaLibrary.groupByAlbum(baseFiltered), [baseFiltered]);
  const artists = useMemo(() => mediaLibrary.groupByArtist(baseFiltered), [baseFiltered]);
  const folders = useMemo(() => mediaLibrary.groupByFolder(baseFiltered), [baseFiltered]);

  const unavailableCount = unavailableTrackIds.size;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-2 py-2 border-b border-gray-100 dark:border-gray-800 space-y-1.5">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск…"
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
        />

        <div className="flex items-center gap-1 justify-between">
          <div className="flex gap-0.5 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLibraryTab(tab.id)}
                className={tabClass(libraryTab === tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split("-") as [SortField, SortDirection];
              setSort(field, dir);
            }}
            className="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 shrink-0"
          >
            <option value="title-asc">А–Я</option>
            <option value="title-desc">Я–А</option>
            <option value="artist-asc">Артист</option>
            <option value="addedAt-desc">Новые</option>
            <option value="duration-asc">Короткие</option>
          </select>
        </div>

        {unavailableCount > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            <select
              value={unavailableFilter}
              onChange={(e) => setUnavailableFilter(e.target.value as UnavailableFilter)}
              className="text-[10px] px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
            >
              <option value="hide">Скрыть недоступные</option>
              <option value="show">Показать недоступные</option>
              <option value="only">Только недоступные</option>
            </select>
            {unavailableFilter !== "hide" ? (
              <button
                type="button"
                onClick={() => void removeAllUnavailableFromLibrary()}
                className="text-[10px] px-1.5 py-0.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
              >
                Удалить все ({unavailableCount})
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 px-1 py-1">
        {libraryTab === "tracks" || libraryTab === "favorites" ? (
          <TrackList tracks={filteredTracks} onPlay={(id) => void playTrack(id, filteredTracks)} />
        ) : libraryTab === "albums" ? (
          <div className="h-full overflow-auto space-y-0.5">
            {albums.map((group) => (
              <button
                key={`${group.artist}-${group.album}`}
                type="button"
                onClick={() => void playAlbum(group.tracks)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                  {group.coverArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.coverArtUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/track-placeholder.png" alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {group.album}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {group.artist} · {group.tracks.length}
                  </p>
                </div>
              </button>
            ))}
            {albums.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">Пусто</p>
            )}
          </div>
        ) : libraryTab === "folders" ? (
          <div className="h-full overflow-auto space-y-0.5">
            {folders.map((group) => (
              <button
                key={group.folderPath}
                type="button"
                onClick={() => void playAlbum(group.tracks)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs flex-shrink-0">
                  📁
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {group.folderPath === "/" ? "Корень" : group.folderPath}
                  </p>
                  <p className="text-[10px] text-gray-500">{group.tracks.length} треков</p>
                </div>
              </button>
            ))}
            {folders.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">Пусто</p>
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto space-y-0.5">
            {artists.map((group) => (
              <button
                key={group.artist}
                type="button"
                onClick={() => void playAlbum(group.tracks)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xs flex-shrink-0">
                  🎤
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {group.artist}
                  </p>
                  <p className="text-[10px] text-gray-500">{group.tracks.length} треков</p>
                </div>
              </button>
            ))}
            {artists.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">Пусто</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
