import { agentDebugLog } from "@/lib/debug-agent-log";
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

type LockScreenActionOpts = { lockScreen?: boolean };

type MediaSessionCallbacks = {
  onSyncPlay: () => void;
  onSyncPause: () => void;
  onPrevious: (opts?: LockScreenActionOpts) => void;
  onNext: (opts?: LockScreenActionOpts) => void;
};

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
  );
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
    left: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: "0.001",
    pointerEvents: "none",
    zIndex: "-1",
  });
}

export class AudioEngine {
  private audio: CapturableAudio;
  private ownsAudioElement: boolean;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private analyserTrackKey: string | null = null;
  private objectUrl: string | null = null;
  private status: PlaybackStatus = "idle";
  private mediaDuration = 0;
  private callbacks: AudioEngineCallbacks;
  private savePositionTimer: ReturnType<typeof setInterval> | null = null;
  private onSavePosition: ((position: number) => void) | null = null;
  private lifecycleAttached = false;
  private mediaSessionInstalled = false;
  private lastPositionLogAt = 0;
  private positionSkipLogged = false;
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

  constructor(callbacks: AudioEngineCallbacks, existingAudio?: HTMLAudioElement | null) {
    this.callbacks = callbacks;
    this.ownsAudioElement = !existingAudio;
    this.audio = (existingAudio ?? new Audio()) as CapturableAudio;
    this.configureAudioElement();

    if (typeof document !== "undefined") {
      if (this.ownsAudioElement) {
        hideAudioElement(this.audio);
        document.body.appendChild(this.audio);
      }
      ensureNavigatorAudioSession();
      this.attachLifecycleHandlers();
      this.installMediaSessionHandlers();
    }

    this.audio.addEventListener("timeupdate", () => {
      this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      if (this.status === "playing") this.updatePositionState();
    });
    this.audio.addEventListener("durationchange", () => {
      if (this.audio.duration > 0) this.mediaDuration = this.audio.duration;
      this.updatePositionState();
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

  private configureAudioElement(): void {
    this.audio.preload = "auto";
    this.audio.playbackRate = 1;
    this.audio.setAttribute("playsinline", "true");
    this.audio.setAttribute("webkit-playsinline", "true");
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

  setMediaDuration(seconds: number): void {
    if (seconds > 0 && Number.isFinite(seconds)) {
      this.mediaDuration = seconds;
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

  /**
   * iOS Safari: любой повторный setActionHandler сбрасывает ВСЕ остальные handlers.
   * Регистрируем один раз и дальше только обновляем sessionCallbacks / metadata.
   */
  private installMediaSessionHandlers(): void {
    if (this.mediaSessionInstalled || !("mediaSession" in navigator)) return;
    this.mediaSessionInstalled = true;

    const handlers: Array<{
      action: MediaSessionAction;
      handler: MediaSessionActionHandler;
    }> = [
      {
        action: "play",
        handler: () => {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:play-handler",
            "mediaSession play handler fired",
            {
              paused: this.audio.paused,
              muted: this.audio.muted,
              volume: this.audio.volume,
              readyState: this.audio.readyState,
              hasSrc: !!this.audio.src,
            },
            "H1-handlers",
          );
          // #endregion
          this.handleMediaSessionPlay(() => this.sessionCallbacks.onSyncPlay());
        },
      },
      {
        action: "pause",
        handler: () => {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:pause-handler",
            "mediaSession pause handler fired",
            { currentTime: this.audio.currentTime },
            "H1-handlers",
          );
          // #endregion
          this.handleMediaSessionPause(() => this.sessionCallbacks.onSyncPause());
        },
      },
      {
        action: "previoustrack",
        handler: () => {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:prev-handler",
            "mediaSession previoustrack fired",
            { queueViaCallback: true },
            "H1-handlers",
          );
          // #endregion
          this.sessionCallbacks.onPrevious({ lockScreen: true });
        },
      },
      {
        action: "nexttrack",
        handler: () => {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:next-handler",
            "mediaSession nexttrack fired",
            { queueViaCallback: true },
            "H1-handlers",
          );
          // #endregion
          this.sessionCallbacks.onNext({ lockScreen: true });
        },
      },
      {
        action: "stop",
        handler: () => {
          this.stop();
          this.sessionCallbacks.onSyncPause();
        },
      },
    ];

    if (typeof navigator.mediaSession.setPositionState === "function") {
      handlers.push({
        action: "seekto",
        handler: (details) => {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:seekto-handler",
            "mediaSession seekto fired",
            { seekTime: details.seekTime },
            "H6-seekto",
          );
          // #endregion
          if (details.seekTime == null || !Number.isFinite(details.seekTime)) return;
          this.seek(details.seekTime);
          this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
        },
      });
    }

    if (!isIOSDevice()) {
      handlers.push(
        {
          action: "seekbackward",
          handler: (details) => {
            const offset = details.seekOffset ?? 10;
            this.seek(this.audio.currentTime - offset);
            this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
          },
        },
        {
          action: "seekforward",
          handler: (details) => {
            const offset = details.seekOffset ?? 10;
            this.seek(this.audio.currentTime + offset);
            this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
          },
        },
      );
    }

    const installed: string[] = [];
    for (const { action, handler } of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
        installed.push(action);
      } catch {
        /* Safari / PWA */
      }
    }
    // #region agent log
    agentDebugLog(
      "audio-engine.ts:install-handlers",
      "mediaSession handlers installed",
      { installed, ios: isIOSDevice(), pwa: isStandalonePWA() },
      "H1-handlers",
    );
    // #endregion
  }

  private ensureAudioInDom(): void {
    if (typeof document === "undefined") return;
    if (!this.audio.isConnected) {
      hideAudioElement(this.audio);
      document.body.appendChild(this.audio);
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

  private handleMediaSessionPlay(onSync?: () => void): void {
    ensureNavigatorAudioSession();
    this.ensureAudioInDom();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    const onSuccess = () => {
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:play-success",
        "audio.play resolved",
        {
          paused: this.audio.paused,
          muted: this.audio.muted,
          volume: this.audio.volume,
          readyState: this.audio.readyState,
          currentTime: this.audio.currentTime,
          connected: this.audio.isConnected,
        },
        "H4-pwa-play",
      );
      // #endregion
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      this.setStatus("playing");
      this.updatePositionState();
      onSync?.();
    };

    const onFail = (label: string, err?: unknown) => {
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:play-fail",
        label,
        {
          err: err instanceof Error ? err.message : String(err),
          paused: this.audio.paused,
          muted: this.audio.muted,
          readyState: this.audio.readyState,
          hasSrc: !!this.audio.src,
          connected: this.audio.isConnected,
        },
        "H4-pwa-play",
      );
      // #endregion
    };

    const retry = () => {
      const p = this.audio.play();
      if (p !== undefined) p.then(onSuccess).catch((e) => onFail("retry play rejected", e));
    };

    const promise = this.audio.play();
    if (promise !== undefined) {
      promise.then(onSuccess).catch((e) => {
        onFail("initial play rejected", e);
        retry();
      });
    } else {
      onSuccess();
    }
  }

  playFromLockScreen(onDone?: () => void): void {
    this.handleMediaSessionPlay(onDone);
  }

  private handleMediaSessionPause(onSync?: () => void): void {
    ensureNavigatorAudioSession();
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    this.setStatus("paused");
    this.updatePositionState();
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

  private getEffectiveDuration(): number {
    const audioDuration = this.audio.duration;
    if (Number.isFinite(audioDuration) && audioDuration > 0) {
      return audioDuration;
    }
    return this.mediaDuration;
  }

  private updatePositionState(): void {
    if (!("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (this.status === "stopped" || this.status === "idle" || this.status === "loading") return;

    const duration = this.getEffectiveDuration();
    const position = this.audio.currentTime;
    if (duration <= 0 || !Number.isFinite(duration) || !Number.isFinite(position)) {
      // #region agent log
      if (!this.positionSkipLogged) {
        this.positionSkipLogged = true;
        agentDebugLog(
          "audio-engine.ts:position-skip",
          "setPositionState skipped — invalid duration",
          {
            duration,
            position,
            audioDuration: this.audio.duration,
            mediaDuration: this.mediaDuration,
            status: this.status,
          },
          "H3-position",
        );
      }
      // #endregion
      return;
    }
    this.positionSkipLogged = false;

    const playbackRate =
      this.status === "playing" && this.audio.playbackRate > 0 ? this.audio.playbackRate : 1;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.max(0, Math.min(position, duration)),
      });
      // #region agent log
      const now = Date.now();
      if (now - this.lastPositionLogAt > 15000) {
        this.lastPositionLogAt = now;
        agentDebugLog(
          "audio-engine.ts:position-state",
          "setPositionState ok",
          {
            duration,
            position,
            playbackRate,
            audioDuration: this.audio.duration,
            mediaDuration: this.mediaDuration,
            status: this.status,
          },
          "H3-position",
        );
      }
      // #endregion
    } catch (err) {
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:position-state-fail",
        "setPositionState threw",
        {
          err: err instanceof Error ? err.message : String(err),
          duration,
          position,
          mediaDuration: this.mediaDuration,
        },
        "H3-position",
      );
      // #endregion
    }
  }

  setSourceUrlSync(url: string, startPosition = 0, duration = 0): void {
    ensureNavigatorAudioSession();
    this.ensureAudioInDom();
    if (this.objectUrl && this.objectUrl !== url) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (duration > 0) this.mediaDuration = duration;
    this.audio.playbackRate = 1;
    this.audio.src = url;
    this.audio.load();
    if (startPosition > 0) {
      this.audio.currentTime = startPosition;
    }
    this.setStatus("paused");
    this.updatePositionState();
  }

  async load(file: File, startPosition = 0, knownDuration = 0): Promise<void> {
    this.setStatus("loading");
    if (!isIOSDevice()) this.releaseAudioGraph();
    ensureNavigatorAudioSession();
    this.revokeUrl();
    this.objectUrl = URL.createObjectURL(file);
    this.audio.playbackRate = 1;
    this.audio.src = this.objectUrl;
    if (knownDuration > 0) this.mediaDuration = knownDuration;

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

    if (this.audio.duration > 0) {
      this.mediaDuration = this.audio.duration;
    }

    if (startPosition > 0) {
      this.audio.currentTime = startPosition;
    }
    this.setStatus("paused");
    this.updatePositionState();
  }

  async play(): Promise<void> {
    ensureNavigatorAudioSession();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    if (isPageHidden()) {
      await new Promise<void>((resolve) => this.handleMediaSessionPlay(resolve));
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
    this.updatePositionState();
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
    const duration = this.getEffectiveDuration();
    const clamped =
      duration > 0 && Number.isFinite(duration)
        ? Math.max(0, Math.min(time, duration))
        : Math.max(0, time);
    this.audio.currentTime = clamped;
    this.updatePositionState();
    this.callbacks.onTimeUpdate(this.audio.currentTime, duration);
  }

  updateMediaSession(
    track: Track | null,
    handlers: {
      onPlay: () => void;
      onPause: () => void;
      onPrevious: (opts?: LockScreenActionOpts) => void;
      onNext: (opts?: LockScreenActionOpts) => void;
    },
    queueInfo?: { queueLength: number; queueIndex: number },
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

    if (track.duration > 0) {
      this.mediaDuration = track.duration;
    }

    const albumLabel =
      track.album ||
      (queueInfo && queueInfo.queueLength > 1
        ? `Очередь · ${queueInfo.queueIndex + 1} из ${queueInfo.queueLength}`
        : "QHub Music");

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: albumLabel,
      artwork: track.coverArtUrl
        ? [{ src: track.coverArtUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    this.updatePositionState();
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
    if (this.ownsAudioElement && this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
  }
}
