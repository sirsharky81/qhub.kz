import { logAudioAlert, logAudioEvent, setAudioDiagnostics } from "@/lib/audioDebug";
import { agentDebugLog } from "@/lib/debug-agent-log";
import type { Track } from "./types";

export async function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 3) return;
  return new Promise<void>((resolve, reject) => {
    const onCanPlay = () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      reject(new Error("Audio load error"));
    };
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
  });
}

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

/** iOS: один setActionHandler на всех — handlers живут на уровне модуля */
let globalMediaSessionInstalled = false;
let installedMediaSessionActions: string[] = [];
let activeEngine: AudioEngine | null = null;
const globalSessionCallbacks: MediaSessionCallbacks = {
  onSyncPlay: () => {},
  onSyncPause: () => {},
  onPrevious: () => {},
  onNext: () => {},
};

function installMediaSessionHandlersGlobally(): void {
  if (globalMediaSessionInstalled || !("mediaSession" in navigator)) return;
  globalMediaSessionInstalled = true;

  if (isIOSDevice()) {
    for (const action of ["seekbackward", "seekforward"] as MediaSessionAction[]) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* Safari / PWA */
      }
    }
  }

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
            paused: activeEngine?.getAudioElement().paused,
            muted: activeEngine?.getAudioElement().muted,
            volume: activeEngine?.getAudioElement().volume,
            readyState: activeEngine?.getAudioElement().readyState,
            hasSrc: !!activeEngine?.getAudioElement().src,
          },
          "H1-handlers",
          "post-fix",
        );
        // #endregion
        if (
          activeEngine?.isSoftPaused() &&
          activeEngine.getAudioElement().paused &&
          isPWA()
        ) {
          // #region agent log
          agentDebugLog(
            "audio-engine.ts:soft-pause-failed",
            "soft-pause-failed: audio.paused=true in play-handler",
            {
              softPauseVolume: activeEngine.getSoftPauseVolume(),
              volume: activeEngine.getAudioElement().volume,
            },
            "H4-pwa-play",
            "post-fix-v3",
          );
          // #endregion
        }
        globalSessionCallbacks.onSyncPlay();
      },
    },
    {
      action: "pause",
      handler: () => {
        // #region agent log
        agentDebugLog(
          "audio-engine.ts:pause-handler",
          "mediaSession pause handler fired",
          { currentTime: activeEngine?.getAudioElement().currentTime },
          "H1-handlers",
          "post-fix",
        );
        // #endregion
        activeEngine?.dispatchLockScreenPause(() => globalSessionCallbacks.onSyncPause());
      },
    },
    {
      action: "previoustrack",
      handler: () => {
        // #region agent log
        agentDebugLog(
          "audio-engine.ts:prev-handler",
          "mediaSession previoustrack fired",
          {},
          "H1-handlers",
          "post-fix",
        );
        // #endregion
        globalSessionCallbacks.onPrevious({ lockScreen: true });
      },
    },
    {
      action: "nexttrack",
      handler: () => {
        // #region agent log
        agentDebugLog(
          "audio-engine.ts:next-handler",
          "mediaSession nexttrack fired",
          {},
          "H1-handlers",
          "post-fix",
        );
        // #endregion
        globalSessionCallbacks.onNext({ lockScreen: true });
      },
    },
    {
      action: "stop",
      handler: () => {
        activeEngine?.stop();
        globalSessionCallbacks.onSyncPause();
      },
    },
  ];

  const seekToHandler: MediaSessionActionHandler = (details) => {
    // #region agent log
    agentDebugLog(
      "audio-engine.ts:seekto-handler",
      "mediaSession seekto fired",
      { seekTime: details.seekTime },
      "H6-seekto",
      "post-fix-v2",
    );
    // #endregion
    if (details.seekTime == null || !Number.isFinite(details.seekTime)) return;
    activeEngine?.seek(details.seekTime);
  };

  // iOS: seekto + previoustrack/nexttrack, seek±10 = null (1335111). Без seekto iOS показывает native ±10.
  if (typeof navigator.mediaSession.setPositionState === "function") {
    handlers.push({ action: "seekto", handler: seekToHandler });
  }

  if (!isIOSDevice()) {
    handlers.push(
      {
        action: "seekbackward",
        handler: (details) => {
          const offset = details.seekOffset ?? 10;
          activeEngine?.seek((activeEngine?.getAudioElement().currentTime ?? 0) - offset);
        },
      },
      {
        action: "seekforward",
        handler: (details) => {
          const offset = details.seekOffset ?? 10;
          activeEngine?.seek((activeEngine?.getAudioElement().currentTime ?? 0) + offset);
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
    "mediaSession handlers installed (global once)",
    {
      installed,
      ios: isIOSDevice(),
      pwa: isStandalonePWA(),
      iosMode: isIOSDevice() ? "ios-seekto-track-skip" : "desktop-full",
    },
    "H1-handlers",
    "post-fix",
  );
  // #endregion
  installedMediaSessionActions = installed;
  setAudioDiagnostics({
    ios: isIOSDevice(),
    pwa: isStandalonePWA(),
    iosMode: isIOSDevice() ? "ios-seekto-track-skip" : "desktop-full",
    installedHandlers: installed,
  });
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS || isStandalone;
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

function isPWA(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function getInstalledMediaSessionActions(): string[] {
  return [...installedMediaSessionActions];
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
  private lastPositionLogAt = 0;
  private positionSkipLogged = false;
  private lastReportedPosition = -1;
  private visibleResumeInFlight = false;
  private lastVisibleResumeAt = 0;
  private softPauseVolume: number | null = null;
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
    logAudioEvent(`visibilitychange:${document.visibilityState}`, this.audio);
    if (document.visibilityState === "hidden") {
      if (!isIOSDevice()) this.teardownAnalyser();
      return;
    }
    void this.onPageBecameVisible("visibilitychange");
  };

  private readonly onPageShowOrFocus = () => {
    if (document.visibilityState !== "visible") return;
    logAudioEvent("lifecycle:pageshow-or-focus", this.audio);
    void this.onPageBecameVisible("pageshow-or-focus");
  };

  /** Foreground: simple resume like 1335111 — no handleMediaSessionPlay recovery loop. */
  private async onPageBecameVisible(source: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastVisibleResumeAt < 400) return;
    if (this.visibleResumeInFlight) return;

    this.visibleResumeInFlight = true;
    this.lastVisibleResumeAt = now;
    logAudioEvent(`visibility:resume:${source}`, this.audio);
    try {
      await this.resumePlaybackIfNeeded();
    } finally {
      this.visibleResumeInFlight = false;
    }
  }

  private restoreSoftPauseVolumeIfNeeded(): void {
    if (this.softPauseVolume === null) return;
    this.audio.volume = this.softPauseVolume;
    this.softPauseVolume = null;
    logAudioEvent("soft-pause:unlock-restore-volume", this.audio);
  }

  isSoftPaused(): boolean {
    return this.softPauseVolume !== null;
  }

  getSoftPauseVolume(): number | null {
    return this.softPauseVolume;
  }

  private async resumePlaybackIfNeeded(): Promise<void> {
    this.restoreSoftPauseVolumeIfNeeded();

    if (!isIOSDevice() && this.context?.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        /* ignore */
      }
    }

    if (this.status !== "playing" || !this.audio.paused || !this.audio.src) return;

    this.audio.playbackRate = 1;
    this.nudgeIOSAudioPipeline();
    try {
      logAudioEvent("resume:simple-play", this.audio);
      await this.audio.play();
      if (!isIOSDevice() && !isPageHidden()) {
        void this.ensureAnalyser();
      }
    } catch {
      /* gesture / policy */
    }
  }

  constructor(callbacks: AudioEngineCallbacks, existingAudio?: HTMLAudioElement | null) {
    this.callbacks = callbacks;
    this.ownsAudioElement = !existingAudio;
    this.audio = (existingAudio ?? new Audio()) as CapturableAudio;
    this.configureAudioElement();
    activeEngine = this;

    if (typeof document !== "undefined") {
      if (this.ownsAudioElement) {
        hideAudioElement(this.audio);
        document.body.appendChild(this.audio);
      }
      ensureNavigatorAudioSession();
      this.attachLifecycleHandlers();
      installMediaSessionHandlersGlobally();
    }

    this.audio.addEventListener("timeupdate", () => {
      this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      if (!this.audio.paused) this.updatePositionState();
    });
    this.audio.addEventListener("durationchange", () => {
      if (this.audio.duration > 0) this.mediaDuration = this.audio.duration;
      this.updatePositionState(true);
    });
    this.audio.addEventListener("ended", () => {
      logAudioEvent("ended", this.audio);
      this.setStatus("stopped");
      this.callbacks.onEnded();
    });
    this.audio.addEventListener("error", () => {
      logAudioEvent("error", this.audio);
      this.callbacks.onError("Ошибка воспроизведения");
      this.setStatus("stopped");
    });
    this.audio.addEventListener("playing", () => {
      logAudioEvent("playing", this.audio);
      this.setStatus("playing");
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
      }
      this.onPlayingForAnalyser();
    });
    this.audio.addEventListener("pause", () => {
      logAudioEvent("pause", this.audio);
      if (this.status !== "stopped") {
        this.setStatus("paused");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
          setAudioDiagnostics({ mediaSessionPlaybackState: "paused" });
        }
        this.updatePositionState();
      }
    });
    this.audio.addEventListener("waiting", () => {
      logAudioEvent("waiting", this.audio);
      this.setStatus("loading");
    });
    this.audio.addEventListener("canplay", () => logAudioEvent("canplay", this.audio));
    this.audio.addEventListener("canplaythrough", () =>
      logAudioEvent("canplaythrough", this.audio),
    );
    this.audio.addEventListener("stalled", () => logAudioEvent("stalled", this.audio));
    this.audio.addEventListener("suspend", () => logAudioEvent("suspend", this.audio));
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

  dispatchLockScreenPlay(onSync?: () => void): void {
    this.handleMediaSessionPlay(onSync);
  }

  dispatchLockScreenPause(onSync?: () => void): void {
    this.handleMediaSessionPause(onSync);
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
    window.addEventListener("pageshow", this.onPageShowOrFocus);
    window.addEventListener("focus", this.onPageShowOrFocus);
  }

  private detachLifecycleHandlers(): void {
    if (!this.lifecycleAttached || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pageshow", this.onPageShowOrFocus);
    window.removeEventListener("focus", this.onPageShowOrFocus);
    this.lifecycleAttached = false;
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

  private nudgeIOSAudioPipeline(): void {
    if (!isIOSDevice() || !this.audio.src) return;
    const pos = this.audio.currentTime;
    this.audio.currentTime = pos;
  }

  private async verifyPlaybackProgress(source: string): Promise<boolean> {
    if (this.audio.paused) return false;

    const t0 = this.audio.currentTime;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    if (this.audio.paused) return false;

    const delta = this.audio.currentTime - t0;
    const frozen = Math.abs(delta) < 0.05;
    const payload = {
      source,
      t0,
      t1: this.audio.currentTime,
      delta,
      paused: this.audio.paused,
      readyState: this.audio.readyState,
      status: this.status,
      pwa: isStandalonePWA(),
    };

    if (frozen) {
      logAudioEvent(`zombie:${source}`, this.audio);
      logAudioAlert(`ZOMBIE ${source}: playing but t stuck at ${t0.toFixed(1)}s`);
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:zombie-detect",
        "audio reports playing but currentTime frozen",
        payload,
        "H7-zombie",
        "post-fix-v2",
      );
      // #endregion
      return true;
    }

    logAudioEvent(`progress-ok:${source}`, this.audio);
    // #region agent log
    agentDebugLog(
      "audio-engine.ts:progress-ok",
      "currentTime advanced after play",
      payload,
      "H7-zombie",
      "post-fix-v2",
    );
    // #endregion
    return false;
  }

  private async playUntilPlaying(): Promise<void> {
    await waitForAudioReady(this.audio);

    if (!this.audio.paused) return;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        if (!this.audio.paused) {
          resolve();
          return;
        }
        reject(new Error("play timeout — still paused"));
      }, 8000);

      const onPlaying = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("play error event"));
      };
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        this.audio.removeEventListener("playing", onPlaying);
        this.audio.removeEventListener("error", onError);
      };

      this.audio.addEventListener("playing", onPlaying);
      this.audio.addEventListener("error", onError);

      const playPromise = this.audio.play();
      if (playPromise) {
        playPromise.catch((err) => {
          cleanup();
          reject(err);
        });
      }
    });
  }

  private handleMediaSessionPlay(onSync?: () => void): void {
    ensureNavigatorAudioSession();
    this.ensureAudioInDom();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    logAudioEvent("mediaSession:play", this.audio);

    if (
      typeof document !== "undefined" &&
      document.hidden &&
      isPWA() &&
      this.softPauseVolume !== null &&
      !this.audio.paused
    ) {
      this.audio.volume = this.softPauseVolume;
      this.softPauseVolume = null;
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
      }
      this.setStatus("playing");
      this.updatePositionState(true);
      logAudioEvent("soft-resume:unmute-only", this.audio);
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:soft-resume",
        "soft-resume: unmute only",
        {
          paused: this.audio.paused,
          volume: this.audio.volume,
          currentTime: this.audio.currentTime,
        },
        "H4-pwa-play",
        "post-fix-v3",
      );
      // #endregion
      onSync?.();
      void this.verifyPlaybackProgress("lockscreen-play");
      return;
    }

    this.softPauseVolume = null;
    this.nudgeIOSAudioPipeline();

    const onSuccess = () => {
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:play-success",
        "lock screen audio.play resolved",
        {
          paused: this.audio.paused,
          readyState: this.audio.readyState,
          currentTime: this.audio.currentTime,
          pwa: isStandalonePWA(),
        },
        "H4-pwa-play",
        "post-fix-v2",
      );
      // #endregion
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
      }
      this.setStatus("playing");
      this.updatePositionState(true);
      onSync?.();
      void this.verifyPlaybackProgress("lockscreen-play");
    };

    const onFail = (label: string, err?: unknown) => {
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:play-fail",
        label,
        {
          err: err instanceof Error ? err.message : String(err),
          paused: this.audio.paused,
          readyState: this.audio.readyState,
          hasSrc: !!this.audio.src,
          pwa: isStandalonePWA(),
        },
        "H4-pwa-play",
        "post-fix-v2",
      );
      // #endregion
    };

    const retry = () => {
      const p = this.audio.play();
      if (p !== undefined) {
        p.then(onSuccess).catch((e) => onFail("retry play rejected", e));
      }
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
    logAudioEvent("mediaSession:pause", this.audio);

    if (typeof document !== "undefined" && document.hidden && isPWA()) {
      this.softPauseVolume = this.audio.volume;
      this.audio.volume = 0;
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
        setAudioDiagnostics({ mediaSessionPlaybackState: "paused" });
      }
      this.setStatus("paused");
      this.lastReportedPosition = this.audio.currentTime;
      this.onSavePosition?.(this.audio.currentTime);
      logAudioEvent("soft-pause:volume-zero", this.audio);
      if (
        "mediaSession" in navigator &&
        typeof navigator.mediaSession.setPositionState === "function"
      ) {
        const duration = this.getEffectiveDuration();
        const position = this.audio.currentTime;
        if (duration > 0 && Number.isFinite(duration) && Number.isFinite(position)) {
          const clampedPosition = Math.max(0, Math.min(position, duration));
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.round(duration * 100) / 100,
              position: Math.round(clampedPosition * 100) / 100,
              playbackRate: 0,
            });
            this.lastReportedPosition = clampedPosition;
            logAudioEvent("soft-pause:position-state-rate-zero", this.audio);
          } catch {
            /* iOS may reject setPositionState while hidden */
          }
        }
      }
      // #region agent log
      agentDebugLog(
        "audio-engine.ts:soft-pause",
        "soft-pause: volume=0, pipeline kept alive",
        {
          softPauseVolume: this.softPauseVolume,
          paused: this.audio.paused,
          currentTime: this.audio.currentTime,
        },
        "H4-pwa-play",
        "post-fix-v3",
      );
      // #endregion
      onSync?.();
      return;
    }

    this.softPauseVolume = null;
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      setAudioDiagnostics({ mediaSessionPlaybackState: "paused" });
    }
    this.setStatus("paused");
    this.lastReportedPosition = this.audio.currentTime;
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

  private updatePositionState(force = false): void {
    if (this.isSoftPaused()) return;
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

    if (this.audio.paused) {
      if (isIOSDevice()) return;
    } else if (
      !force &&
      this.lastReportedPosition >= 0 &&
      Math.abs(position - this.lastReportedPosition) < 0.05
    ) {
      return;
    }

    const playbackRate = this.audio.paused
      ? 0
      : this.audio.playbackRate > 0
        ? this.audio.playbackRate
        : 1;

    const clampedPosition = Math.max(0, Math.min(position, duration));
    const roundedDuration = Math.round(duration * 100) / 100;
    const roundedPosition = Math.round(clampedPosition * 100) / 100;

    try {
      navigator.mediaSession.setPositionState({
        duration: roundedDuration,
        playbackRate,
        position: roundedPosition,
      });
      this.lastReportedPosition = clampedPosition;
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
    this.updatePositionState(true);
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
    this.updatePositionState(true);
  }

  async play(): Promise<void> {
    ensureNavigatorAudioSession();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    if (isPageHidden()) {
      this.handleMediaSessionPlay();
      return;
    }

    try {
      logAudioEvent("play:request", this.audio);
      await this.playUntilPlaying();
      void this.verifyPlaybackProgress("ui-play");
      if (!isIOSDevice()) {
        await this.ensureAnalyser();
      }
      this.updatePositionState();
    } catch (err) {
      logAudioEvent("play:error", this.audio);
      this.setStatus("paused");
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    }
  }

  pause(): void {
    logAudioEvent("pause:request", this.audio);
    if (this.softPauseVolume !== null) {
      this.audio.volume = this.softPauseVolume;
      this.softPauseVolume = null;
    }
    this.audio.pause();
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
    this.updatePositionState(true);
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

    globalSessionCallbacks.onSyncPlay = handlers.onPlay;
    globalSessionCallbacks.onSyncPause = handlers.onPause;
    globalSessionCallbacks.onPrevious = handlers.onPrevious;
    globalSessionCallbacks.onNext = handlers.onNext;
    this.sessionCallbacks = globalSessionCallbacks;

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

    this.updatePositionState(true);
  }

  setMediaSessionPlaybackState(state: "playing" | "paused" | "none"): void {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  destroy(): void {
    if (activeEngine === this) activeEngine = null;
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
