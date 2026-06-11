import type { Track } from "./types";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stopped";

export interface AudioEngineCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onStatusChange: (status: PlaybackStatus) => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onGraphReady?: (analyser: AnalyserNode) => void;
}

type CapturableAudio = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

type MediaSessionCallbacks = {
  onSyncPlay: () => void;
  onSyncPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

function ensureNavigatorAudioSession(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    nav.audioSession.type = "playback";
  }
}

function hideAudioElement(audio: HTMLAudioElement): void {
  Object.assign(audio.style, {
    position: "fixed",
    left: "-9999px",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
}

export class AudioEngine {
  private audio: CapturableAudio;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private analyserTrackKey: string | null = null;
  private objectUrl: string | null = null;
  private status: PlaybackStatus = "idle";
  private callbacks: AudioEngineCallbacks;
  private savePositionTimer: ReturnType<typeof setInterval> | null = null;
  private onSavePosition: ((position: number) => void) | null = null;
  private lifecycleAttached = false;
  private mediaSessionRegistered = false;
  private sessionCallbacks: MediaSessionCallbacks = {
    onSyncPlay: () => {},
    onSyncPause: () => {},
    onPrevious: () => {},
    onNext: () => {},
  };

  private readonly onPlayingForAnalyser = () => {
    if (!isIOSDevice() && !isPageHidden()) void this.ensureAnalyser();
  };

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (!isIOSDevice()) this.teardownAnalyser();
      return;
    }
    void this.resumePlaybackIfNeeded();
  };

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
    this.audio = new Audio() as CapturableAudio;
    this.audio.preload = "auto";
    this.audio.playbackRate = 1;
    this.audio.setAttribute("playsinline", "true");
    this.audio.setAttribute("webkit-playsinline", "true");

    if (typeof document !== "undefined") {
      hideAudioElement(this.audio);
      document.body.appendChild(this.audio);
      ensureNavigatorAudioSession();
      this.attachLifecycleHandlers();
      this.registerMediaSessionHandlersOnce();
    }

    this.audio.addEventListener("timeupdate", () => {
      this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      if (this.status === "playing") this.updatePositionState();
    });
    this.audio.addEventListener("durationchange", () => {
      if (this.status === "playing") this.updatePositionState();
    });
    this.audio.addEventListener("ended", () => {
      this.setStatus("stopped");
      this.callbacks.onEnded();
    });
    this.audio.addEventListener("error", () => {
      this.callbacks.onError("Ошибка воспроизведения");
      this.setStatus("stopped");
    });
    this.audio.addEventListener("playing", () => {
      this.setStatus("playing");
      this.onPlayingForAnalyser();
    });
    this.audio.addEventListener("pause", () => {
      if (this.status !== "stopped") this.setStatus("paused");
    });
    this.audio.addEventListener("waiting", () => this.setStatus("loading"));
    this.audio.addEventListener("ratechange", () => {
      if (this.audio.playbackRate !== 1) {
        this.audio.playbackRate = 1;
      }
    });
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  setSavePositionHandler(handler: (position: number) => void): void {
    this.onSavePosition = handler;
    if (this.savePositionTimer) clearInterval(this.savePositionTimer);
    this.savePositionTimer = setInterval(() => {
      if (this.status === "playing") {
        this.onSavePosition?.(this.audio.currentTime);
      }
    }, 3000);
  }

  /** iOS ломает lock screen, если setActionHandler вызывать повторно */
  private registerMediaSessionHandlersOnce(): void {
    if (this.mediaSessionRegistered || !("mediaSession" in navigator)) return;
    this.mediaSessionRegistered = true;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        void this.handleMediaSessionPlay(() => this.sessionCallbacks.onSyncPlay());
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        this.handleMediaSessionPause(() => this.sessionCallbacks.onSyncPause());
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        void this.sessionCallbacks.onPrevious();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        void this.sessionCallbacks.onNext();
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        this.stop();
        this.sessionCallbacks.onSyncPause();
      });
    } catch {
      /* Safari */
    }

    if (!isIOSDevice()) {
      try {
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          const offset = details.seekOffset ?? 10;
          this.seek(this.audio.currentTime - offset);
          this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
        });
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          const offset = details.seekOffset ?? 10;
          this.seek(this.audio.currentTime + offset);
          this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
        });
      } catch {
        /* ignore */
      }

      if (typeof navigator.mediaSession.setPositionState === "function") {
        try {
          navigator.mediaSession.setActionHandler("seekto", (details) => {
            if (details.seekTime == null || !Number.isFinite(details.seekTime)) return;
            this.seek(details.seekTime);
            this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
          });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private attachLifecycleHandlers(): void {
    if (this.lifecycleAttached || typeof document === "undefined") return;
    this.lifecycleAttached = true;

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pageshow", this.onVisibilityChange);
    window.addEventListener("focus", this.onVisibilityChange);
  }

  private detachLifecycleHandlers(): void {
    if (!this.lifecycleAttached || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pageshow", this.onVisibilityChange);
    window.removeEventListener("focus", this.onVisibilityChange);
    this.lifecycleAttached = false;
  }

  private async resumePlaybackIfNeeded(): Promise<void> {
    if (isIOSDevice()) return;

    if (this.context?.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        /* ignore */
      }
    }

    if (this.status === "playing" && this.audio.paused && this.audio.src) {
      try {
        await this.audio.play();
        void this.ensureAnalyser();
      } catch {
        /* ignore */
      }
    }
  }

  private captureStream(): MediaStream | null {
    if (typeof this.audio.captureStream === "function") {
      return this.audio.captureStream();
    }
    if (typeof this.audio.mozCaptureStream === "function") {
      return this.audio.mozCaptureStream();
    }
    return null;
  }

  private teardownAnalyser(): void {
    if (this.streamSource) {
      try {
        this.streamSource.disconnect();
      } catch {
        /* ignore */
      }
      this.streamSource = null;
    }
    this.analyserTrackKey = null;
  }

  private releaseAudioGraph(): void {
    this.teardownAnalyser();
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.analyser = null;
    }
  }

  private async handleMediaSessionPlay(onSync?: () => void): Promise<void> {
    ensureNavigatorAudioSession();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    const resume = async () => {
      await this.audio.play();
    };

    try {
      await resume();
    } catch {
      const src = this.audio.currentSrc || this.audio.src;
      const position = this.audio.currentTime;
      if (!src) return;
      this.audio.src = src;
      this.audio.currentTime = position;
      try {
        await resume();
      } catch {
        return;
      }
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    this.setStatus("playing");
    this.updatePositionState();
    onSync?.();
  }

  private handleMediaSessionPause(onSync?: () => void): void {
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    this.setStatus("paused");
    this.onSavePosition?.(this.audio.currentTime);
    onSync?.();
  }

  private async ensureAnalyser(): Promise<void> {
    if (isIOSDevice() || isPageHidden()) return;

    const trackKey = this.audio.src;
    if (!trackKey || this.analyserTrackKey === trackKey) return;

    const stream = this.captureStream();
    if (!stream) return;

    try {
      if (!this.context) {
        this.context = new AudioContext();
      }

      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      this.teardownAnalyser();

      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.75;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
      }

      this.streamSource = this.context.createMediaStreamSource(stream);
      this.streamSource.connect(this.analyser);
      this.analyserTrackKey = trackKey;
      this.callbacks.onGraphReady?.(this.analyser);
    } catch {
      this.teardownAnalyser();
    }
  }

  private revokeUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private setStatus(status: PlaybackStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private updatePositionState(): void {
    if (!("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (this.status !== "playing") return;

    const duration = this.audio.duration;
    const position = this.audio.currentTime;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: this.audio.playbackRate > 0 ? this.audio.playbackRate : 1,
        position: Math.max(0, Math.min(position, duration)),
      });
    } catch {
      /* Safari */
    }
  }

  async load(file: File, startPosition = 0): Promise<void> {
    this.setStatus("loading");
    if (!isIOSDevice()) this.releaseAudioGraph();
    ensureNavigatorAudioSession();
    this.revokeUrl();
    this.objectUrl = URL.createObjectURL(file);
    this.audio.playbackRate = 1;
    this.audio.src = this.objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onCanPlay = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("Cannot load audio"));
      };
      const cleanup = () => {
        this.audio.removeEventListener("canplay", onCanPlay);
        this.audio.removeEventListener("error", onErr);
      };
      this.audio.addEventListener("canplay", onCanPlay);
      this.audio.addEventListener("error", onErr);
      if (!isIOSDevice()) {
        this.audio.load();
      }
    });

    if (startPosition > 0) {
      this.audio.currentTime = startPosition;
    }
    this.setStatus("paused");
  }

  async play(): Promise<void> {
    ensureNavigatorAudioSession();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    if (isPageHidden()) {
      await this.handleMediaSessionPlay();
      return;
    }

    await this.audio.play();

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    if (!isIOSDevice()) {
      await this.ensureAnalyser();
    }
    this.updatePositionState();
  }

  pause(): void {
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    this.setStatus("paused");
    this.onSavePosition?.(this.audio.currentTime);
    if (!isIOSDevice()) this.teardownAnalyser();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setStatus("stopped");
    this.onSavePosition?.(0);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }
  }

  seek(time: number): void {
    if (!Number.isFinite(time)) return;
    const duration = this.audio.duration;
    const clamped =
      duration > 0 && Number.isFinite(duration)
        ? Math.max(0, Math.min(time, duration))
        : Math.max(0, time);
    this.audio.currentTime = clamped;
    if (this.status === "playing") this.updatePositionState();
  }

  updateMediaSession(
    track: Track | null,
    handlers: {
      onPlay: () => void;
      onPause: () => void;
      onPrevious: () => void;
      onNext: () => void;
    },
  ): void {
    if (!("mediaSession" in navigator)) return;

    this.sessionCallbacks = {
      onSyncPlay: handlers.onPlay,
      onSyncPause: handlers.onPause,
      onPrevious: handlers.onPrevious,
      onNext: handlers.onNext,
    };

    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.coverArtUrl
        ? [{ src: track.coverArtUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    if (this.status === "playing") {
      this.updatePositionState();
    }
  }

  setMediaSessionPlaybackState(state: "playing" | "paused" | "none"): void {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  destroy(): void {
    this.stop();
    this.revokeUrl();
    this.releaseAudioGraph();
    if (this.savePositionTimer) clearInterval(this.savePositionTimer);
    this.detachLifecycleHandlers();
    this.audio.removeEventListener("playing", this.onPlayingForAnalyser);
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
  }
}
