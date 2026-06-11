import type { Track } from "./types";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stopped";

export interface AudioEngineCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onStatusChange: (status: PlaybackStatus) => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onGraphReady?: (analyser: AnalyserNode) => void;
}

export class AudioEngine {
  private audio: HTMLAudioElement;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private connected = false;
  private objectUrl: string | null = null;
  private status: PlaybackStatus = "idle";
  private callbacks: AudioEngineCallbacks;
  private savePositionTimer: ReturnType<typeof setInterval> | null = null;
  private onSavePosition: ((position: number) => void) | null = null;

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
    this.audio = new Audio();
    this.audio.preload = "auto";

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
    this.audio.addEventListener("playing", () => this.setStatus("playing"));
    this.audio.addEventListener("pause", () => {
      if (this.status !== "stopped") this.setStatus("paused");
    });
    this.audio.addEventListener("waiting", () => this.setStatus("loading"));
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
    const v = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = v;
      this.audio.volume = 1;
    } else {
      this.audio.volume = v;
    }
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

  private ensureAudioGraph(): void {
    if (this.connected) return;
    try {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;
      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this.audio.volume;
      this.source = this.context.createMediaElementSource(this.audio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.context.destination);
      this.audio.volume = 1;
      this.connected = true;
      if (this.analyser) {
        this.callbacks.onGraphReady?.(this.analyser);
      }
    } catch {
      // Web Audio API unavailable — playback still works via <audio>
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
    this.revokeUrl();
    this.objectUrl = URL.createObjectURL(file);
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
    this.ensureAudioGraph();
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
    this.setStatus("paused");
  }

  async play(): Promise<void> {
    this.ensureAudioGraph();
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
    await this.audio.play();
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

  updateMediaSession(track: Track | null, handlers: {
    onPlay: () => void;
    onPause: () => void;
    onPrevious: () => void;
    onNext: () => void;
  }): void {
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
    if (this.savePositionTimer) clearInterval(this.savePositionTimer);
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.context) {
      void this.context.close();
    }
  }
}
