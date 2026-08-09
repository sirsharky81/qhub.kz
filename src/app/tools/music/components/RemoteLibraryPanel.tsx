"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

type NasTab = "tracks" | "albums" | "artists";

type Artist = { id: string; name: string; albumCount: number };
type Album = {
  id: string;
  name: string;
  artist: string;
  songCount: number;
  coverArt: string | null;
  year: number | null;
};

/** Drill-down under artists/albums tabs (not the top-level mode). */
type Drill =
  | null
  | { kind: "artist-albums"; artistId: string; artistName: string }
  | {
      kind: "album-tracks";
      albumId: string;
      albumName: string;
      artistId: string;
      artistName: string;
      from: "artists" | "albums";
    };

const TABS: { id: NasTab; label: string }[] = [
  { id: "tracks", label: "Треки" },
  { id: "albums", label: "Альбомы" },
  { id: "artists", label: "Артисты" },
];

const tabClass = (active: boolean) =>
  `px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
    active
      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
  }`;

export function RemoteLibraryPanel({ onClose }: { onClose?: () => void }) {
  const { playRemoteTracks } = useMusicPlayer();
  const [tab, setTab] = useState<NasTab>("artists");
  const [drill, setDrill] = useState<Drill>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const loadBrowse = useCallback(async (mode: NasTab) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      if (mode === "artists") {
        const res = await fetch("/api/music/remote/artists");
        const data = (await res.json()) as { artists?: Artist[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        if (id !== requestId.current) return;
        setArtists(data.artists ?? []);
        setAlbums([]);
        setTracks([]);
      } else if (mode === "albums") {
        const res = await fetch("/api/music/remote/albums");
        const data = (await res.json()) as { albums?: Album[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        if (id !== requestId.current) return;
        setAlbums(data.albums ?? []);
        setArtists([]);
        setTracks([]);
      } else {
        const res = await fetch("/api/music/remote/tracks");
        const data = (await res.json()) as { tracks?: Track[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        if (id !== requestId.current) return;
        setTracks(data.tracks ?? []);
        setArtists([]);
        setAlbums([]);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (mode: NasTab, q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      await loadBrowse(mode);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/music/remote/search?q=${encodeURIComponent(trimmed)}&scope=${mode}`,
      );
      const data = (await res.json()) as {
        artists?: Artist[];
        albums?: Album[];
        tracks?: Track[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      if (id !== requestId.current) return;
      setArtists(mode === "artists" ? (data.artists ?? []) : []);
      setAlbums(mode === "albums" ? (data.albums ?? []) : []);
      setTracks(mode === "tracks" ? (data.tracks ?? []) : []);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [loadBrowse]);

  useEffect(() => {
    if (drill) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const delay = query.trim() ? 280 : 0;
    searchTimer.current = setTimeout(() => {
      void runSearch(tab, query);
    }, delay);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, tab, drill, runSearch]);

  function selectTab(next: NasTab) {
    setTab(next);
    setDrill(null);
    setQuery("");
    setError(null);
  }

  async function openArtist(artist: Artist) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/remote/artists/${encodeURIComponent(artist.id)}`);
      const data = (await res.json()) as { albums?: Album[]; name?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (id !== requestId.current) return;
      setAlbums(data.albums ?? []);
      setTracks([]);
      setDrill({
        kind: "artist-albums",
        artistId: artist.id,
        artistName: data.name ?? artist.name,
      });
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function openAlbum(
    album: Album,
    artistId: string,
    artistName: string,
    from: "artists" | "albums",
  ) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/remote/albums/${encodeURIComponent(album.id)}`);
      const data = (await res.json()) as { tracks?: Track[]; name?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (id !== requestId.current) return;
      setTracks(data.tracks ?? []);
      setDrill({
        kind: "album-tracks",
        albumId: album.id,
        albumName: data.name ?? album.name,
        artistId,
        artistName,
        from,
      });
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  function goBack() {
    if (drill?.kind === "album-tracks" && drill.from === "artists" && drill.artistId) {
      void openArtist({ id: drill.artistId, name: drill.artistName, albumCount: 0 });
      return;
    }
    setDrill(null);
    setQuery("");
    void loadBrowse(tab);
  }

  const title =
    drill?.kind === "album-tracks"
      ? drill.albumName
      : drill?.kind === "artist-albums"
        ? drill.artistName
        : "Библиотека NAS";

  const searchPlaceholder =
    tab === "tracks"
      ? "Поиск по трекам…"
      : tab === "albums"
        ? "Поиск по альбомам…"
        : "Поиск по артистам…";

  const showRoot = drill === null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        {!showRoot && (
          <button
            type="button"
            className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={goBack}
          >
            ← Назад
          </button>
        )}
        <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex-1 truncate">
          {title}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-gray-500 hover:text-gray-800"
          >
            Закрыть
          </button>
        )}
      </div>

      {showRoot && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100 dark:border-gray-800 space-y-1.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs"
          />
          <div className="flex gap-0.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className={tabClass(tab === t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mx-3 mt-2 mb-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : drill?.kind === "album-tracks" || (showRoot && tab === "tracks") ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {tracks.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-gray-400">Нет треков</li>
            ) : (
              <>
                <li className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => void playRemoteTracks(tracks)}
                    className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                  >
                    ▶ Играть {drill?.kind === "album-tracks" ? "альбом" : "все"}
                  </button>
                </li>
                {tracks.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void playRemoteTracks(tracks, t.id)}
                      className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg flex gap-2"
                    >
                      <span className="text-[10px] text-gray-400 w-5 shrink-0">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {t.artist}
                          {t.album ? ` · ${t.album}` : ""} · {formatTime(t.duration)}
                        </p>
                      </span>
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        ) : drill?.kind === "artist-albums" || (showRoot && tab === "albums") ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {albums.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-gray-400">Нет альбомов</li>
            ) : (
              albums.map((al) => (
                <li key={al.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void openAlbum(
                        al,
                        drill?.kind === "artist-albums" ? drill.artistId : "",
                        drill?.kind === "artist-albums" ? drill.artistName : al.artist,
                        drill?.kind === "artist-albums" ? "artists" : "albums",
                      )
                    }
                    className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg"
                  >
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{al.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {al.artist ? `${al.artist} · ` : ""}
                      {al.songCount} трек. {al.year ? `· ${al.year}` : ""}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {artists.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-gray-400">Нет артистов</li>
            ) : (
              artists.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void openArtist(a)}
                    className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg"
                  >
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                    <p className="text-[10px] text-gray-400">{a.albumCount} альб.</p>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
