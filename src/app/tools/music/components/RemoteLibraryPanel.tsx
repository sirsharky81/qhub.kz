"use client";

import { useCallback, useEffect, useState } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

type Artist = { id: string; name: string; albumCount: number };
type Album = {
  id: string;
  name: string;
  artist: string;
  songCount: number;
  coverArt: string | null;
  year: number | null;
};

type View =
  | { kind: "artists" }
  | { kind: "albums"; artistId: string; artistName: string }
  | {
      kind: "tracks";
      albumId: string;
      albumName: string;
      artistId: string;
      artistName: string;
    };

export function RemoteLibraryPanel({ onClose }: { onClose?: () => void }) {
  const { playRemoteTracks } = useMusicPlayer();
  const [view, setView] = useState<View>({ kind: "artists" });
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArtists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/music/remote/artists");
      const data = (await res.json()) as { artists?: Artist[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setArtists(data.artists ?? []);
      setView({ kind: "artists" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  async function openArtist(artist: Artist) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/remote/artists/${encodeURIComponent(artist.id)}`);
      const data = (await res.json()) as { albums?: Album[]; name?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setAlbums(data.albums ?? []);
      setView({ kind: "albums", artistId: artist.id, artistName: data.name ?? artist.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function openAlbum(album: Album, artistId: string, artistName: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/remote/albums/${encodeURIComponent(album.id)}`);
      const data = (await res.json()) as { tracks?: Track[]; name?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setTracks(data.tracks ?? []);
      setView({
        kind: "tracks",
        albumId: album.id,
        albumName: data.name ?? album.name,
        artistId,
        artistName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (view.kind === "tracks" && view.artistId) {
      void openArtist({ id: view.artistId, name: view.artistName, albumCount: 0 });
      return;
    }
    void loadArtists();
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      await loadArtists();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/remote/search?q=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as {
        artists?: Artist[];
        albums?: Album[];
        tracks?: Track[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      setArtists(data.artists ?? []);
      setAlbums(data.albums ?? []);
      setTracks(data.tracks ?? []);
      setView({ kind: "artists" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        {view.kind !== "artists" && (
          <button
            type="button"
            className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={goBack}
          >
            ← Назад
          </button>
        )}
        <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex-1 truncate">
          {view.kind === "artists" && "Библиотека NAS"}
          {view.kind === "albums" && view.artistName}
          {view.kind === "tracks" && view.albumName}
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

      <div className="flex-shrink-0 px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs"
          />
        </form>
      </div>

      {error && (
        <p className="mx-3 mb-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : view.kind === "artists" ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {query.trim() && albums.length > 0 && (
              <li className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400">Альбомы</li>
            )}
            {query.trim() &&
              albums.map((al) => (
                <li key={`al-${al.id}`}>
                  <button
                    type="button"
                    onClick={() => void openAlbum(al, "", al.artist)}
                    className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg"
                  >
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{al.name}</p>
                    <p className="text-[10px] text-gray-400">{al.artist}</p>
                  </button>
                </li>
              ))}
            {query.trim() && tracks.length > 0 && (
              <>
                <li className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400">Треки</li>
                {tracks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void playRemoteTracks(tracks, t.id)}
                      className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg"
                    >
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{t.title}</p>
                      <p className="text-[10px] text-gray-400">
                        {t.artist} · {formatTime(t.duration)}
                      </p>
                    </button>
                  </li>
                ))}
              </>
            )}
            <li className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400">
              Исполнители
            </li>
            {artists.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-gray-400">Пусто</li>
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
        ) : view.kind === "albums" ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {albums.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-gray-400">Нет альбомов</li>
            ) : (
              albums.map((al) => (
                <li key={al.id}>
                  <button
                    type="button"
                    onClick={() => void openAlbum(al, view.artistId, view.artistName)}
                    className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg"
                  >
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{al.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {al.songCount} трек. {al.year ? `· ${al.year}` : ""}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
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
                    ▶ Играть альбом
                  </button>
                </li>
                {tracks.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void playRemoteTracks(tracks, t.id)}
                      className="w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg flex gap-2"
                    >
                      <span className="text-[10px] text-gray-400 w-5">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-gray-400">{formatTime(t.duration)}</p>
                      </span>
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
