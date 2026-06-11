"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AudioEngine, type PlaybackStatus } from "@/lib/music/audio-engine";
import * as storage from "@/lib/music/indexed-db-storage";
import * as mediaLibrary from "@/lib/music/media-library";
import { QueueManager } from "@/lib/music/queue-manager";
import type {
  ImportProgress,
  LibraryTab,
  Playlist,
  RepeatMode,
  SortDirection,
  SortField,
  Track,
} from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

interface MusicPlayerContextValue {
  tracks: Track[];
  currentTrack: Track | null;
  queue: string[];
  queueIndex: number;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  favoriteTrackIds: Set<string>;
  playlists: Playlist[];
  libraryTab: LibraryTab;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  importProgress: ImportProgress | null;
  isLibraryLoading: boolean;
  isPlayerReady: boolean;
  analyser: AnalyserNode | null;
  getLiveTime: () => number;

  setLibraryTab: (tab: LibraryTab) => void;
  setSearchQuery: (q: string) => void;
  setSort: (field: SortField, direction: SortDirection) => void;
  importFiles: (files: File[]) => Promise<void>;
  importDirectory: () => Promise<void>;
  pickFiles: () => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playTrack: (trackId: string, contextTracks?: Track[]) => Promise<void>;
  playAlbum: (tracks: Track[], startId?: string) => Promise<void>;
  toggleFavorite: (trackId: string) => void;
  addToQueue: (trackId: string) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  moveQueueItem: (index: number, direction: -1 | 1) => void;
  removeTrackFromLibrary: (trackId: string) => Promise<void>;
  createPlaylist: (name: string, trackIds: string[]) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  clearLibrary: () => Promise<void>;
  filteredTracks: Track[];
  favoriteTracks: Track[];
  formatTime: (s: number) => string;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

export function useMusicPlayerOptional(): MusicPlayerContextValue | null {
  return useContext(MusicPlayerContext);
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("none");
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("tracks");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const volumeBeforeMuteRef = useRef(0.85);
  const queueRef = useRef(new QueueManager());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  const sessionActionsRef = useRef({
    onPrevious: (_opts?: { lockScreen?: boolean }) => {},
    onNext: (_opts?: { lockScreen?: boolean }) => {},
  });

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const persistState = useCallback(async () => {
    const qm = queueRef.current;
    await storage.savePlaybackState({
      queue: qm.getQueue(),
      queueIndex: qm.getIndex(),
      lastTrackId: currentTrack?.id ?? null,
      lastPosition: engineRef.current?.getAudioElement().currentTime ?? 0,
      favoriteTrackIds: Array.from(favoriteTrackIds),
      settings: { volume, shuffle, repeat },
    });
  }, [currentTrack, favoriteTrackIds, volume, shuffle, repeat]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => void persistState(), 500);
  }, [persistState]);

  const prefetchQueueNeighbors = useCallback((trackId: string) => {
    const q = queueRef.current.getQueue();
    const idx = q.indexOf(trackId);
    if (idx < 0) return;
    const neighborIds = q.slice(Math.max(0, idx - 2), Math.min(q.length, idx + 3));
    void mediaLibrary.prefetchTrackFiles(neighborIds);
  }, []);

  const bindMediaSession = useCallback(
    (track: Track) => {
      const q = queueRef.current.getQueue();
      const idx = Math.max(0, queueRef.current.getIndex());
      engineRef.current?.updateMediaSession(
        track,
        {
          onPlay: () => {
            engineRef.current?.setMediaSessionPlaybackState("playing");
            schedulePersist();
          },
          onPause: () => {
            engineRef.current?.setMediaSessionPlaybackState("paused");
            schedulePersist();
          },
          onPrevious: (opts) => {
            sessionActionsRef.current.onPrevious(opts);
          },
          onNext: (opts) => {
            sessionActionsRef.current.onNext(opts);
          },
        },
        { queueLength: q.length, queueIndex: idx },
      );
    },
    [schedulePersist],
  );

  const tryLockScreenTrackSwitch = useCallback(
    (trackId: string): boolean => {
      const file = mediaLibrary.getCachedTrackFile(trackId);
      if (!file) return false;

      const track = tracksRef.current.find((t) => t.id === trackId);
      if (!track) return false;

      const engine = engineRef.current;
      if (!engine) return false;

      const url = mediaLibrary.getOrCreateObjectUrl(track.id, file);
      engine.setSourceUrlSync(url, 0);
      setCurrentTrack(track);
      setDuration(track.duration || engine.getAudioElement().duration || 0);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      engine.setVolume(volume);
      bindMediaSession(track);
      engine.playFromLockScreen();
      engine.setMediaSessionPlaybackState("playing");
      schedulePersist();
      prefetchQueueNeighbors(trackId);
      return true;
    },
    [volume, bindMediaSession, schedulePersist, prefetchQueueNeighbors],
  );

  useEffect(() => {
    if (!isPlayerReady) return;
    schedulePersist();
  }, [favoriteTrackIds, volume, shuffle, repeat, queue, queueIndex, isPlayerReady, schedulePersist]);

  const loadAndPlay = useCallback(
    async (trackId: string, startPosition = 0) => {
      const track = tracks.find((t) => t.id === trackId) ?? (await storage.getTrack(trackId));
      if (!track) return;

      const file = await mediaLibrary.getTrackFile(track);
      if (!file) return;
      mediaLibrary.cacheTrackFile(track.id, file);
      mediaLibrary.getOrCreateObjectUrl(track.id, file);

      const engine = engineRef.current;
      if (!engine) return;

      await engine.load(file, startPosition);
      setCurrentTrack(track);
      setDuration(track.duration || engine.getAudioElement().duration || 0);
      engine.setVolume(volume);
      bindMediaSession(track);

      const hidden =
        typeof document !== "undefined" &&
        (document.hidden || document.visibilityState === "hidden");
      if (hidden) {
        await new Promise<void>((resolve) => engine.playFromLockScreen(resolve));
      } else {
        await engine.play();
      }
      engine.setMediaSessionPlaybackState("playing");
      schedulePersist();
      prefetchQueueNeighbors(trackId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, volume, schedulePersist, bindMediaSession, prefetchQueueNeighbors],
  );

  const loadNext = useCallback(
    async (opts?: { lockScreen?: boolean }) => {
      const nextId = queueRef.current.next();
      if (!nextId) {
        engineRef.current?.stop();
        setStatus("stopped");
        return;
      }
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());

      if (opts?.lockScreen && tryLockScreenTrackSwitch(nextId)) {
        return;
      }
      await loadAndPlay(nextId);
    },
    [loadAndPlay, tryLockScreenTrackSwitch],
  );

  const loadPrevious = useCallback(
    async (opts?: { lockScreen?: boolean }) => {
      const engine = engineRef.current;
      if (engine && engine.getAudioElement().currentTime > 3) {
        engine.seek(0);
        if (opts?.lockScreen && engine.getStatus() === "playing") {
          engine.playFromLockScreen();
        }
        return;
      }
      const prevId = queueRef.current.previous();
      if (!prevId) return;
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());

      if (opts?.lockScreen && tryLockScreenTrackSwitch(prevId)) {
        return;
      }
      await loadAndPlay(prevId);
    },
    [loadAndPlay, tryLockScreenTrackSwitch],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const engine = new AudioEngine({
      onTimeUpdate: (t, d) => {
        setCurrentTime(t);
        if (d > 0) setDuration(d);
      },
      onStatusChange: setStatus,
      onEnded: () => void loadNext(),
      onError: () => setStatus("stopped"),
      onGraphReady: (node) => setAnalyser(node),
    });

    engine.setSavePositionHandler((pos) => {
      void storage.savePlaybackState({
        queue: queueRef.current.getQueue(),
        queueIndex: queueRef.current.getIndex(),
        lastTrackId: currentTrack?.id ?? null,
        lastPosition: pos,
        favoriteTrackIds: Array.from(favoriteTrackIds),
        settings: { volume, shuffle, repeat },
      });
    });

    engineRef.current = engine;
    const existingAnalyser = engine.getAnalyser();
    if (existingAnalyser) setAnalyser(existingAnalyser);
    setIsPlayerReady(true);

    void (async () => {
      const [loadedTracks, state, loadedPlaylists] = await Promise.all([
        mediaLibrary.loadLibrary(),
        storage.getPlaybackState(),
        storage.getPlaylists(),
      ]);

      setTracks(loadedTracks);
      setPlaylists(loadedPlaylists);
      setFavoriteTrackIds(new Set(state.favoriteTrackIds));
      const savedVolume = state.settings.volume;
      if (savedVolume > 0) volumeBeforeMuteRef.current = savedVolume;
      setVolumeState(savedVolume);
      setShuffle(state.settings.shuffle);
      setRepeat(state.settings.repeat);
      engine.setVolume(savedVolume);
      queueRef.current.fromState(state.queue, state.queueIndex);
      queueRef.current.setShuffle(state.settings.shuffle);
      queueRef.current.setRepeat(state.settings.repeat);
      setQueue(state.queue);
      setQueueIndex(state.queueIndex);
      setIsLibraryLoading(false);

      if (state.lastTrackId && loadedTracks.some((t) => t.id === state.lastTrackId)) {
        const track = loadedTracks.find((t) => t.id === state.lastTrackId)!;
        setCurrentTrack(track);
        if (state.queue.length === 0) {
          queueRef.current.playTrack(state.lastTrackId);
          setQueue([state.lastTrackId]);
          setQueueIndex(0);
        }
        try {
          const file = await mediaLibrary.getTrackFile(track);
          if (file) {
            mediaLibrary.cacheTrackFile(track.id, file);
            mediaLibrary.getOrCreateObjectUrl(track.id, file);
            await engine.load(file, state.lastPosition);
            setDuration(track.duration || engine.getAudioElement().duration || 0);
            bindMediaSession(track);
            setStatus("paused");
            void mediaLibrary.prefetchTrackFiles(state.queue);
          }
        } catch {
          /* restore without audio */
        }
      }
    })();

    return () => {
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importFilesHandler = useCallback(
    async (files: File[]) => {
      setImportProgress({ total: files.length, processed: 0, currentFile: "" });
      const imported = await mediaLibrary.importFiles(files, setImportProgress);
      setTracks((prev) => [...prev, ...imported]);
      setImportProgress(null);
      if (imported.length > 0 && !currentTrack) {
        queueRef.current.playAllFromTracks([...tracks, ...imported], imported[0].id);
        setQueue(queueRef.current.getQueue());
        setQueueIndex(queueRef.current.getIndex());
        await loadAndPlay(imported[0].id);
      }
      schedulePersist();
    },
    [currentTrack, tracks, loadAndPlay, schedulePersist],
  );

  const importDirectoryHandler = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker!({ mode: "read" });
      setImportProgress({ total: 0, processed: 0, currentFile: "" });
      const imported = await mediaLibrary.importDirectory(dirHandle, setImportProgress);
      setTracks((prev) => [...prev, ...imported]);
      setImportProgress(null);
      if (imported.length > 0 && !currentTrack) {
        queueRef.current.playAllFromTracks([...tracks, ...imported], imported[0].id);
        setQueue(queueRef.current.getQueue());
        setQueueIndex(queueRef.current.getIndex());
        await loadAndPlay(imported[0].id);
      }
      schedulePersist();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        fileInputRef.current?.click();
      }
      setImportProgress(null);
    }
  }, [currentTrack, tracks, loadAndPlay, schedulePersist]);

  const pickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const play = useCallback(async () => {
    if (!currentTrack) return;
    const engine = engineRef.current;
    if (!engine) return;
    await engine.play();
    engine.setMediaSessionPlaybackState("playing");
  }, [currentTrack]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    engineRef.current?.setMediaSessionPlaybackState("paused");
    schedulePersist();
  }, [schedulePersist]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current?.setMediaSessionPlaybackState("none");
    setCurrentTime(0);
    schedulePersist();
  }, [schedulePersist]);

  const togglePlay = useCallback(async () => {
    if (status === "playing") {
      pause();
    } else if (currentTrack) {
      await play();
    }
  }, [status, currentTrack, play, pause]);

  const next = useCallback(async () => {
    await loadNext();
  }, [loadNext]);

  const previous = useCallback(async () => {
    await loadPrevious();
  }, [loadPrevious]);

  useEffect(() => {
    sessionActionsRef.current = {
      onPrevious: loadPrevious,
      onNext: loadNext,
    };
  }, [loadPrevious, loadNext]);

  const seek = useCallback((time: number) => {
    engineRef.current?.seek(time);
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      if (clamped > 0) volumeBeforeMuteRef.current = clamped;
      setVolumeState(clamped);
      engineRef.current?.setVolume(clamped);
      schedulePersist();
    },
    [schedulePersist],
  );

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      volumeBeforeMuteRef.current = volume;
      setVolume(0);
    } else {
      setVolume(volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 0.85);
    }
  }, [volume, setVolume]);

  const toggleShuffle = useCallback(() => {
    const next = !shuffle;
    setShuffle(next);
    queueRef.current.setShuffle(next);
    schedulePersist();
  }, [shuffle, schedulePersist]);

  const cycleRepeat = useCallback(() => {
    const mode = queueRef.current.cycleRepeat();
    setRepeat(mode);
    schedulePersist();
  }, [schedulePersist]);

  const playTrack = useCallback(
    async (trackId: string, contextTracks?: Track[]) => {
      const list = contextTracks ?? tracks;
      queueRef.current.playTrack(trackId, list.map((t) => t.id));
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlay(trackId);
    },
    [tracks, loadAndPlay],
  );

  const playAlbum = useCallback(
    async (albumTracks: Track[], startId?: string) => {
      const ids = albumTracks.map((t) => t.id);
      const start = startId ?? ids[0];
      queueRef.current.setQueue(ids, ids.indexOf(start));
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlay(start);
    },
    [loadAndPlay],
  );

  const toggleFavorite = useCallback(
    (trackId: string) => {
      setFavoriteTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      schedulePersist();
    },
    [schedulePersist],
  );

  const addToQueue = useCallback(
    (trackId: string) => {
      queueRef.current.addToQueue(trackId);
      setQueue(queueRef.current.getQueue());
      schedulePersist();
    },
    [schedulePersist],
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      queueRef.current.removeFromQueue(trackId);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      schedulePersist();
    },
    [schedulePersist],
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      queueRef.current.reorderQueue(fromIndex, toIndex);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      schedulePersist();
    },
    [schedulePersist],
  );

  const moveQueueItem = useCallback(
    (index: number, direction: -1 | 1) => {
      if (queueRef.current.moveQueueItem(index, direction)) {
        setQueue(queueRef.current.getQueue());
        setQueueIndex(queueRef.current.getIndex());
        schedulePersist();
      }
    },
    [schedulePersist],
  );

  const removeTrackFromLibrary = useCallback(
    async (trackId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      if (track?.coverArtUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(track.coverArtUrl);
      }

      const wasCurrent = currentTrack?.id === trackId;

      if (queue.includes(trackId)) {
        queueRef.current.removeFromQueue(trackId);
        setQueue(queueRef.current.getQueue());
        setQueueIndex(queueRef.current.getIndex());
      }

      setFavoriteTrackIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });

      await mediaLibrary.deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));

      if (wasCurrent) {
        const nextId = queueRef.current.getCurrentId();
        if (nextId) {
          await loadAndPlay(nextId);
        } else {
          engineRef.current?.stop();
          engineRef.current?.setMediaSessionPlaybackState("none");
          setCurrentTrack(null);
          setCurrentTime(0);
          setDuration(0);
        }
      }

      schedulePersist();
    },
    [tracks, currentTrack, queue, loadAndPlay, schedulePersist],
  );

  const createPlaylist = useCallback(
    async (name: string, trackIds: string[]) => {
      const playlist: Playlist = {
        id: crypto.randomUUID(),
        name,
        trackIds,
        createdAt: Date.now(),
      };
      await storage.savePlaylist(playlist);
      setPlaylists((prev) => [...prev, playlist]);
    },
    [],
  );

  const deletePlaylistHandler = useCallback(async (id: string) => {
    await storage.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearLibraryHandler = useCallback(async () => {
    stop();
    await mediaLibrary.clearLibrary();
    setTracks([]);
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    queueRef.current.clear();
    schedulePersist();
  }, [stop, schedulePersist]);

  const setSort = useCallback((field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  const filteredTracks = useMemo(() => {
    let list = tracks;
    if (libraryTab === "favorites") {
      list = list.filter((t) => favoriteTrackIds.has(t.id));
    }
    list = mediaLibrary.filterTracks(list, searchQuery);
    return mediaLibrary.sortTracks(list, sortField, sortDirection);
  }, [tracks, libraryTab, favoriteTrackIds, searchQuery, sortField, sortDirection]);

  const favoriteTracks = useMemo(
    () => tracks.filter((t) => favoriteTrackIds.has(t.id)),
    [tracks, favoriteTrackIds],
  );

  const getLiveTime = useCallback(() => {
    return engineRef.current?.getAudioElement().currentTime ?? 0;
  }, []);

  const value: MusicPlayerContextValue = {
    tracks,
    currentTrack,
    queue,
    queueIndex,
    status,
    currentTime,
    duration,
    volume,
    isMuted: volume === 0,
    shuffle,
    repeat,
    favoriteTrackIds,
    playlists,
    libraryTab,
    searchQuery,
    sortField,
    sortDirection,
    importProgress,
    isLibraryLoading,
    isPlayerReady,
    analyser,
    getLiveTime,
    setLibraryTab,
    setSearchQuery,
    setSort,
    importFiles: importFilesHandler,
    importDirectory: importDirectoryHandler,
    pickFiles,
    play,
    pause,
    stop,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    playTrack,
    playAlbum,
    toggleFavorite,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    moveQueueItem,
    removeTrackFromLibrary,
    createPlaylist,
    deletePlaylist: deletePlaylistHandler,
    clearLibrary: clearLibraryHandler,
    filteredTracks,
    favoriteTracks,
    formatTime,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void importFilesHandler(files);
          e.target.value = "";
        }}
      />
      {/* Directory picker fallback for desktop */}
      <input
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        id="music-dir-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void importFilesHandler(files);
          e.target.value = "";
        }}
      />
      {children}
    </MusicPlayerContext.Provider>
  );
}
