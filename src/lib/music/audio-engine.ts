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

export class AudioEngine {
  private audio: CapturableAudio;
  /** Только для визуализации — не в цепочке воспроизведения */
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

  private readonly onPlayingForAnalyser = () => {
    void this.ensureAnalyser();
  };

  private readonly onVisibilityResume = () => {
    if (document.visibilityState !== "visible") return;
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
      this.audio.style.display = "none";
      document.body.appendChild(this.audio);
      this.attachLifecycleHandlers();
    }

    this.audio.addEventListener("timeupdate", () => {
      this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
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

  private attachLifecycleHandlers(): void {
    if (this.lifecycleAttached || typeof document === "undefined") return;
    this.lifecycleAttached = true;

    document.addEventListener("visibilitychange", this.onVisibilityResume);
    window.addEventListener("pageshow", this.onVisibilityResume);
    window.addEventListener("focus", this.onVisibilityResume);
  }

  private detachLifecycleHandlers(): void {
    if (!this.lifecycleAttached || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibilityResume);
    window.removeEventListener("pageshow", this.onVisibilityResume);
    window.removeEventListener("focus", this.onVisibilityResume);
    this.lifecycleAttached = false;
  }

  private async resumePlaybackIfNeeded(): Promise<void> {
    if (this.context?.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        /* ignore */
      }
    }

    if (this.status === "playing" && this.audio.paused && this.audio.src) {
      this.audio.playbackRate = 1;
      try {
        await this.audio.play();
      } catch {
        /* gesture / policy */
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

  /** Визуализатор через captureStream — не перехватывает вывод <audio> */
  private async ensureAnalyser(): Promise<void> {
    const trackKey = this.audio.src;
    if (!trackKey || this.analyserTrackKey === trackKey) return;

    const stream = this.captureStream();
    if (!stream) return;

    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.addEventListener("statechange", () => {
          if (this.context?.state === "suspended" && this.status === "playing") {
            void this.context.resume();
          }
        });
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

  async load(file: File, startPosition = 0): Promise<void> {
    this.setStatus("loading");
    this.teardownAnalyser();
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
      this.audio.load();
    });

    if (startPosition > 0) {
      this.audio.currentTime = startPosition;
    }
    this.setStatus("paused");
  }

  async play(): Promise<void> {
    this.audio.playbackRate = 1;
    await this.audio.play();
    await this.ensureAnalyser();
  }

  pause(): void {
    this.audio.pause();
    this.setStatus("paused");
    this.onSavePosition?.(this.audio.currentTime);
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setStatus("stopped");
    this.onSavePosition?.(0);
  }

  seek(time: number): void {
    if (Number.isFinite(time)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || time));
    }
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

    navigator.mediaSession.setActionHandler("play", handlers.onPlay);
    navigator.mediaSession.setActionHandler("pause", handlers.onPause);
    navigator.mediaSession.setActionHandler("previoustrack", handlers.onPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", handlers.onNext);
    navigator.mediaSession.setActionHandler("stop", () => {
      this.stop();
      handlers.onPause();
    });
  }

  setMediaSessionPlaybackState(state: "playing" | "paused" | "none"): void {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  destroy(): void {
    this.stop();
    this.revokeUrl();
    this.teardownAnalyser();
    if (this.savePositionTimer) clearInterval(this.savePositionTimer);
    this.detachLifecycleHandlers();
    this.audio.removeEventListener("playing", this.onPlayingForAnalyser);
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }
}
