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
import { agentDebugLog } from "@/lib/debug-agent-log";
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
  UnavailableFilter,
} from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";
import { MusicToast } from "@/components/music/MusicToast";
import DebugLogPanel from "@/app/tools/music/DebugLogPanel";

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
  unavailableTrackIds: Set<string>;
  unavailableFilter: UnavailableFilter;
  toastMessage: string | null;
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
  addTracksToQueue: (trackIds: string[]) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  moveQueueItem: (index: number, direction: -1 | 1) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  saveQueueAsPlaylist: (name: string) => Promise<void>;
  removeTrackFromLibrary: (trackId: string) => Promise<void>;
  removeAllUnavailableFromLibrary: () => Promise<void>;
  createPlaylist: (name: string, trackIds: string[]) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  playPlaylist: (playlistId: string) => Promise<void>;
  isTrackUnavailable: (trackId: string) => boolean;
  setUnavailableFilter: (filter: UnavailableFilter) => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
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
  const [unavailableTrackIds, setUnavailableTrackIds] = useState<Set<string>>(new Set());
  const [unavailableFilter, setUnavailableFilterState] = useState<UnavailableFilter>("hide");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("tracks");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [nativeAudioReady, setNativeAudioReady] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const volumeBeforeMuteRef = useRef(0.85);
  const queueRef = useRef(new QueueManager());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const unavailableRef = useRef<Set<string>>(new Set());
  const navigationRef = useRef({
    onNext: async (_opts?: { lockScreen?: boolean }) => {},
    onPrevious: async (_opts?: { lockScreen?: boolean }) => {},
  });
  const sessionActionsRef = useRef({
    onPrevious: (_opts?: { lockScreen?: boolean }) => {},
    onNext: (_opts?: { lockScreen?: boolean }) => {},
  });

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    unavailableRef.current = unavailableTrackIds;
  }, [unavailableTrackIds]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const markUnavailable = useCallback((trackId: string) => {
    setUnavailableTrackIds((prev) => {
      if (prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  const markAvailable = useCallback((trackId: string) => {
    setUnavailableTrackIds((prev) => {
      if (!prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }, []);

  const isTrackUnavailable = useCallback(
    (trackId: string) => unavailableTrackIds.has(trackId),
    [unavailableTrackIds],
  );

  const setUnavailableFilter = useCallback((filter: UnavailableFilter) => {
    setUnavailableFilterState(filter);
  }, []);

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

  const prefetchQueueForLockScreen = useCallback((trackId: string) => {
    const q = queueRef.current.getQueue();
    if (q.length === 0) return;
    void mediaLibrary.prefetchTrackFiles(q.length > 1 ? q : [trackId]);
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
      const track = tracksRef.current.find((t) => t.id === trackId);
      const engine = engineRef.current;
      // #region agent log
      agentDebugLog(
        "MusicPlayerContext.tsx:lock-switch",
        "tryLockScreenTrackSwitch",
        {
          trackId,
          hasFile: !!file,
          hasTrack: !!track,
          hasEngine: !!engine,
          queueLen: queueRef.current.getQueue().length,
          queueIndex: queueRef.current.getIndex(),
        },
        "H2-cache",
      );
      // #endregion
      if (!file) return false;
      if (!track) return false;
      if (!engine) return false;

      const url = mediaLibrary.getOrCreateObjectUrl(track.id, file);
      const trackDuration = track.duration || 0;
      engine.setMediaDuration(trackDuration);
      engine.setSourceUrlSync(url, 0, trackDuration);
      setCurrentTrack(track);
      setDuration(trackDuration || engine.getAudioElement().duration || 0);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      engine.setVolume(volume);
      bindMediaSession(track);
      engine.playFromLockScreen(() => {
        engine.setMediaSessionPlaybackState("playing");
        schedulePersist();
      });
      prefetchQueueForLockScreen(trackId);
      return true;
    },
    [volume, bindMediaSession, schedulePersist, prefetchQueueForLockScreen],
  );

  useEffect(() => {
    if (!isPlayerReady) return;
    schedulePersist();
  }, [favoriteTrackIds, volume, shuffle, repeat, queue, queueIndex, isPlayerReady, schedulePersist]);

  const loadAndPlay = useCallback(
    async (trackId: string, startPosition = 0, userInitiated = false): Promise<boolean> => {
      const track =
        tracksRef.current.find((t) => t.id === trackId) ?? (await storage.getTrack(trackId));
      if (!track) return false;

      const file = await mediaLibrary.getTrackFile(track);
      if (!file) {
        markUnavailable(trackId);
        if (userInitiated) {
          showToast("Файл недоступен. Возможно был удалён или перемещён.");
        }
        return false;
      }

      markAvailable(trackId);
      mediaLibrary.cacheTrackFile(track.id, file);
      mediaLibrary.getOrCreateObjectUrl(track.id, file);

      const engine = engineRef.current;
      if (!engine) return false;

      const trackDuration = track.duration || 0;
      engine.setMediaDuration(trackDuration);
      await engine.load(file, startPosition, trackDuration);
      setCurrentTrack(track);
      setDuration(trackDuration || engine.getAudioElement().duration || 0);
      engine.setVolume(volume);
      bindMediaSession(track);

      const hidden =
        typeof document !== "undefined" &&
        (document.hidden || document.visibilityState === "hidden");
      if (hidden) {
        await new Promise<void>((resolve) => {
          engine.playFromLockScreen(() => {
            engine.setMediaSessionPlaybackState("playing");
            resolve();
          });
        });
      } else {
        await engine.play();
        engine.setMediaSessionPlaybackState("playing");
      }
      schedulePersist();
      prefetchQueueForLockScreen(trackId);
      return true;
    },
    [volume, schedulePersist, bindMediaSession, prefetchQueueForLockScreen, markUnavailable, markAvailable, showToast],
  );

  const loadAndPlayWithSkip = useCallback(
    async (trackId: string, startPosition = 0, userInitiated = false, lockScreen = false) => {
      const played = await loadAndPlay(trackId, startPosition, userInitiated);
      if (played || userInitiated) return;

      const qm = queueRef.current;
      const maxAttempts = qm.getQueue().length;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const nextId = qm.next();
        if (!nextId) break;
        setQueue(qm.getQueue());
        setQueueIndex(qm.getIndex());
        if (await loadAndPlay(nextId, 0, false)) return;
      }

      if (!lockScreen) {
        engineRef.current?.stop();
        setStatus("stopped");
      }
    },
    [loadAndPlay],
  );

  const loadNext = useCallback(
    async (opts?: { lockScreen?: boolean }) => {
      const qm = queueRef.current;
      const nextId = qm.next();
      // #region agent log
      agentDebugLog(
        "MusicPlayerContext.tsx:loadNext",
        "loadNext called",
        {
          nextId,
          lockScreen: !!opts?.lockScreen,
          queueLen: qm.getQueue().length,
          queueIndex: qm.getIndex(),
          repeat: qm.getRepeat(),
        },
        "H5-navigation",
        "post-fix-v2",
      );
      // #endregion
      if (!nextId) {
        // #region agent log
        agentDebugLog(
          "MusicPlayerContext.tsx:loadNext",
          "nextId null — end of queue",
          { lockScreen: !!opts?.lockScreen, queueLen: qm.getQueue().length },
          "H5-navigation",
          "post-fix-v2",
        );
        // #endregion
        // Lock screen: stop() ломает audio pipeline (особенно PWA) — не останавливаем
        if (opts?.lockScreen) return;
        engineRef.current?.stop();
        setStatus("stopped");
        return;
      }
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());

      if (opts?.lockScreen && tryLockScreenTrackSwitch(nextId)) {
        // #region agent log
        agentDebugLog(
          "MusicPlayerContext.tsx:loadNext",
          "lock screen sync switch ok",
          { nextId },
          "H5-navigation",
        );
        // #endregion
        return;
      }
      // #region agent log
      agentDebugLog(
        "MusicPlayerContext.tsx:loadNext",
        "falling back to async loadAndPlay",
        { nextId, lockScreen: !!opts?.lockScreen },
        "H5-navigation",
      );
      // #endregion
      await loadAndPlayWithSkip(nextId, 0, false, !!opts?.lockScreen);
    },
    [loadAndPlayWithSkip, tryLockScreenTrackSwitch],
  );

  const loadPrevious = useCallback(
    async (opts?: { lockScreen?: boolean }) => {
      const engine = engineRef.current;
      // В приложении: первое нажатие «назад» = в начало трека. На lock screen — всегда пред. трек.
      if (engine && engine.getAudioElement().currentTime > 3 && !opts?.lockScreen) {
        // #region agent log
        agentDebugLog(
          "MusicPlayerContext.tsx:loadPrevious",
          "seek to 0 (same track)",
          { lockScreen: false },
          "H5-navigation",
          "post-fix-v2",
        );
        // #endregion
        engine.seek(0);
        return;
      }
      const prevId = queueRef.current.previous();
      // #region agent log
      agentDebugLog(
        "MusicPlayerContext.tsx:loadPrevious",
        "loadPrevious called",
        { prevId, lockScreen: !!opts?.lockScreen },
        "H5-navigation",
      );
      // #endregion
      if (!prevId) return;
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());

      if (opts?.lockScreen && tryLockScreenTrackSwitch(prevId)) {
        return;
      }
      await loadAndPlay(prevId, 0, false);
    },
    [loadAndPlay, tryLockScreenTrackSwitch],
  );

  useEffect(() => {
    if (!nativeAudioReady || !nativeAudioRef.current || engineRef.current) return;

    const engine = new AudioEngine(
      {
        onTimeUpdate: (t, d) => {
          setCurrentTime(t);
          if (d > 0) setDuration(d);
        },
        onStatusChange: setStatus,
        onEnded: () => void navigationRef.current.onNext(),
        onError: () => setStatus("stopped"),
        onGraphReady: (node) => setAnalyser(node),
      },
      nativeAudioRef.current,
    );

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

      void mediaLibrary.scanUnavailableTracks(loadedTracks).then(setUnavailableTrackIds);

      if (state.lastTrackId && loadedTracks.some((t) => t.id === state.lastTrackId)) {
        const track = loadedTracks.find((t) => t.id === state.lastTrackId)!;
        setCurrentTrack(track);
        if (state.queue.length === 0 && loadedTracks.length > 0) {
          queueRef.current.playAllFromTracks(loadedTracks, state.lastTrackId);
          setQueue(queueRef.current.getQueue());
          setQueueIndex(queueRef.current.getIndex());
        }
        try {
          const file = await mediaLibrary.getTrackFile(track);
          if (file) {
            mediaLibrary.cacheTrackFile(track.id, file);
            mediaLibrary.getOrCreateObjectUrl(track.id, file);
            engine.setMediaDuration(track.duration || 0);
            await engine.load(file, state.lastPosition, track.duration || 0);
            setDuration(track.duration || engine.getAudioElement().duration || 0);
            bindMediaSession(track);
            setStatus("paused");
            void mediaLibrary.prefetchTrackFiles(
              state.queue.length > 0 ? state.queue : [track.id],
            );
          }
        } catch {
          /* restore without audio */
        }
      }
    })();

    // Provider живёт всё время сессии — не уничтожаем engine при Strict Mode remount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAudioReady]);

  const startImportPlayback = useCallback(
    async (imported: Track[]) => {
      if (imported.length === 0) return;
      queueRef.current.playAllFromTracks(imported, imported[0].id);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlayWithSkip(imported[0].id, 0, false);
    },
    [loadAndPlayWithSkip],
  );

  const importFilesHandler = useCallback(
    async (files: File[]) => {
      setImportProgress({ total: files.length, processed: 0, currentFile: "" });
      const imported = await mediaLibrary.importFiles(files, setImportProgress);
      setTracks((prev) => [...prev, ...imported]);
      setImportProgress(null);
      if (imported.length > 0) {
        await startImportPlayback(imported);
      }
      schedulePersist();
    },
    [startImportPlayback, schedulePersist],
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
      if (imported.length > 0) {
        await startImportPlayback(imported);
      }
      schedulePersist();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        fileInputRef.current?.click();
      }
      setImportProgress(null);
    }
  }, [startImportPlayback, schedulePersist]);

  const pickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const play = useCallback(async () => {
    if (!currentTrack) return;
    const engine = engineRef.current;
    if (!engine) return;
    await engine.play();
    if (engine.getStatus() === "playing") {
      engine.setMediaSessionPlaybackState("playing");
    }
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
    navigationRef.current = {
      onNext: loadNext,
      onPrevious: loadPrevious,
    };
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
      if (unavailableRef.current.has(trackId)) {
        showToast("Файл недоступен. Возможно был удалён или перемещён.");
        return;
      }
      if (contextTracks) {
        queueRef.current.playTrack(trackId, contextTracks.map((t) => t.id));
      } else {
        queueRef.current.playTrack(trackId);
      }
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlayWithSkip(trackId, 0, true);
    },
    [loadAndPlayWithSkip, showToast],
  );

  const playAlbum = useCallback(
    async (albumTracks: Track[], startId?: string) => {
      const ids = albumTracks.map((t) => t.id);
      const start = startId ?? ids[0];
      if (unavailableRef.current.has(start)) {
        showToast("Файл недоступен. Возможно был удалён или перемещён.");
        return;
      }
      queueRef.current.setQueue(ids, ids.indexOf(start));
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlayWithSkip(start, 0, true);
    },
    [loadAndPlayWithSkip, showToast],
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

  const addTracksToQueue = useCallback(
    (trackIds: string[]) => {
      queueRef.current.addTracksToQueue(trackIds);
      setQueue(queueRef.current.getQueue());
      schedulePersist();
    },
    [schedulePersist],
  );

  const clearQueueHandler = useCallback(() => {
    queueRef.current.clear();
    setQueue([]);
    setQueueIndex(-1);
    schedulePersist();
  }, [schedulePersist]);

  const shuffleQueueHandler = useCallback(() => {
    queueRef.current.shuffleQueue();
    setQueue(queueRef.current.getQueue());
    setQueueIndex(queueRef.current.getIndex());
    schedulePersist();
  }, [schedulePersist]);

  const saveQueueAsPlaylist = useCallback(
    async (name: string) => {
      const ids = queueRef.current.getQueue();
      if (ids.length === 0) return;
      const playlist: Playlist = {
        id: crypto.randomUUID(),
        name,
        trackIds: ids,
        createdAt: Date.now(),
      };
      await storage.savePlaylist(playlist);
      setPlaylists((prev) => [...prev, playlist]);
    },
    [],
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
      if (track?.coverArtUrl) {
        mediaLibrary.releaseCoverUrl(trackId);
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
      markAvailable(trackId);

      if (wasCurrent) {
        const nextId = queueRef.current.getCurrentId();
        if (nextId) {
          await loadAndPlayWithSkip(nextId, 0, false);
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
    [tracks, currentTrack, queue, loadAndPlayWithSkip, schedulePersist, markAvailable],
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

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.id === id);
      if (!pl) return prev;
      const updated = { ...pl, name };
      void storage.savePlaylist(updated);
      return prev.map((p) => (p.id === id ? updated : p));
    });
  }, []);

  const addTracksToPlaylist = useCallback(async (playlistId: string, trackIds: string[]) => {
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.id === playlistId);
      if (!pl) return prev;
      const merged = [...pl.trackIds];
      for (const id of trackIds) {
        if (!merged.includes(id)) merged.push(id);
      }
      const updated = { ...pl, trackIds: merged };
      void storage.savePlaylist(updated);
      return prev.map((p) => (p.id === playlistId ? updated : p));
    });
  }, []);

  const removeTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.id === playlistId);
      if (!pl) return prev;
      const updated = { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) };
      void storage.savePlaylist(updated);
      return prev.map((p) => (p.id === playlistId ? updated : p));
    });
  }, []);

  const playPlaylist = useCallback(
    async (playlistId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl || pl.trackIds.length === 0) return;
      queueRef.current.setQueue(pl.trackIds, 0);
      setQueue(queueRef.current.getQueue());
      setQueueIndex(queueRef.current.getIndex());
      await loadAndPlayWithSkip(pl.trackIds[0], 0, false);
    },
    [playlists, loadAndPlayWithSkip],
  );

  const deletePlaylistHandler = useCallback(async (id: string) => {
    await storage.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const removeAllUnavailableFromLibrary = useCallback(async () => {
    const ids = Array.from(unavailableTrackIds);
    for (const id of ids) {
      await removeTrackFromLibrary(id);
    }
  }, [unavailableTrackIds, removeTrackFromLibrary]);

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
    if (unavailableFilter === "hide") {
      list = list.filter((t) => !unavailableTrackIds.has(t.id));
    } else if (unavailableFilter === "only") {
      list = list.filter((t) => unavailableTrackIds.has(t.id));
    }
    list = mediaLibrary.filterTracks(list, searchQuery);
    return mediaLibrary.sortTracks(list, sortField, sortDirection);
  }, [
    tracks,
    libraryTab,
    favoriteTrackIds,
    searchQuery,
    sortField,
    sortDirection,
    unavailableFilter,
    unavailableTrackIds,
  ]);

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
    unavailableTrackIds,
    unavailableFilter,
    toastMessage,
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
    addTracksToQueue,
    removeFromQueue,
    reorderQueue,
    moveQueueItem,
    clearQueue: clearQueueHandler,
    shuffleQueue: shuffleQueueHandler,
    saveQueueAsPlaylist,
    removeTrackFromLibrary,
    removeAllUnavailableFromLibrary,
    createPlaylist,
    renamePlaylist,
    deletePlaylist: deletePlaylistHandler,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    playPlaylist,
    isTrackUnavailable,
    setUnavailableFilter,
    showToast,
    dismissToast,
    clearLibrary: clearLibraryHandler,
    filteredTracks,
    favoriteTracks,
    formatTime,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {/* Нативный <audio> в React-дереве — критично для iOS PWA Media Session */}
      <audio
        ref={(el) => {
          nativeAudioRef.current = el;
          setNativeAudioReady(el !== null);
        }}
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none"
        style={{
          position: "fixed",
          left: 0,
          bottom: 0,
          width: 1,
          height: 1,
          opacity: 0.001,
          zIndex: -1,
        }}
      />
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
      <MusicToast message={toastMessage} onDismiss={dismissToast} />
      <DebugLogPanel />
    </MusicPlayerContext.Provider>
  );
}
