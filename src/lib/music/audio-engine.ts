import { logAudioEvent, setAudioDiagnostics } from "@/lib/audioDebug";
import {
  buildCoverArtwork,
  buildPlaceholderArtwork,
  prefetchTrackPlaceholderArtwork,
} from "./lock-screen-artwork";
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

type MediaSessionHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: (opts?: LockScreenActionOpts) => void;
  onNext: (opts?: LockScreenActionOpts) => void;
  /**
   * iOS PWA resume на lock screen: контекст перезагружает текущий трек по «свежему» blob URL
   * на сохранённой позиции (тот же путь, что и рабочая смена трека) — это оживляет аудио-сессию
   * без перехвата Now Playing. Если не задан, используется обычный play().
   */
  onResume?: () => void;
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
  // PWA на iOS: элемент за экраном (-9999px) глушит звук с lock screen — держим в кадре, но 1px.
  const pwaIos = isIOSDevice() && isStandalonePWA();
  Object.assign(audio.style, {
    position: "fixed",
    left: pwaIos ? "0" : "-9999px",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: pwaIos ? "0.001" : "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
}

/**
 * Движок ВЛАДЕЕТ <audio> (new Audio()), создаёт его императивно и держит всю сессию.
 * Это критично для iOS PWA: элемент, чей первый play() произошёл в user gesture,
 * получает устойчивую audio session, которая переживает фоновую паузу/возобновление.
 * React-рендеренный <audio> (создаётся вне жеста) терял pipeline после pause в hidden → zombie.
 */
export class AudioEngine {
  private audio: CapturableAudio;
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
  private sessionHandlers: MediaSessionHandlers = {
    onPlay: () => {},
    onPause: () => {},
    onPrevious: () => {},
    onNext: () => {},
  };

  private readonly onPlayingForAnalyser = () => {
    if (!isIOSDevice() && !isPageHidden()) void this.ensureAnalyser();
  };

  private readonly onVisibilityChange = () => {
    if (typeof document === "undefined") return;
    logAudioEvent(`visibilitychange:${document.visibilityState}`, this.audio);
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
      this.registerMediaSessionHandlers();
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
      this.onPlayingForAnalyser();
    });
    this.audio.addEventListener("pause", () => {
      logAudioEvent("pause", this.audio);
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

  /** iOS: seekbackward/seekforward = null → кнопки на lock screen становятся ⏮⏭ (а не ±10с) */
  private clearIOSSkipSeekHandlers(): void {
    if (!isIOSDevice() || !("mediaSession" in navigator)) return;
    for (const action of ["seekbackward", "seekforward"] as const) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  }

  /** seekto → бегунок (scrubber) на lock screen. Доступен и на iOS, и на desktop. */
  private registerSeekToHandler(): void {
    if (!("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime == null || !Number.isFinite(details.seekTime)) return;
        this.seek(details.seekTime);
        this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      });
    } catch {
      /* Safari */
    }
  }

  /**
   * iOS перестраивает раскладку lock screen при смене MediaMetadata. Поэтому seek-конфиг
   * (seekto + null seek±) нужно ПЕРЕустанавливать после каждого setMetadata в updateMediaSession.
   * Этот вызов делает это единообразно для конструктора и updateMediaSession.
   */
  private applyIOSSeekConfig(): void {
    this.clearIOSSkipSeekHandlers();
    this.registerSeekToHandler();
  }

  private ensureAudioInDom(): void {
    if (typeof document === "undefined") return;
    hideAudioElement(this.audio);
    if (!this.audio.isConnected) {
      document.body.appendChild(this.audio);
    }
  }

  /**
   * Регистрируем ВЕСЬ набор хендлеров. Вызывается в конструкторе И после каждого
   * setMetadata в updateMediaSession: iOS пересобирает раскладку lock screen при смене
   * метаданных и «забывает» previoustrack/nexttrack → кнопки ⏮⏭ становятся неактивными.
   * setActionHandler идемпотентен, повторная регистрация безопасна.
   */
  private registerMediaSessionHandlers(): void {
    if (!("mediaSession" in navigator)) return;

    const installed: string[] = [];
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
        if (handler) installed.push(action);
      } catch {
        /* Safari / PWA */
      }
    };

    set("play", () => {
      // iOS PWA на lock screen: возобновление того же трека через простой play() даёт «зомби»
      // (играет по флагам, без звука). Делегируем контексту перезагрузку трека по свежему URL —
      // тот же путь, что и рабочая смена трека. В вебе/foreground — обычный play().
      if (
        isIOSDevice() &&
        isStandalonePWA() &&
        isPageHidden() &&
        this.audio.paused &&
        this.sessionHandlers.onResume
      ) {
        logAudioEvent("mediaSession:play", this.audio);
        this.sessionHandlers.onResume();
        return;
      }
      this.handleMediaSessionPlay(() => this.sessionHandlers.onPlay());
    });
    set("pause", () => this.handleMediaSessionPause(() => this.sessionHandlers.onPause()));
    set("previoustrack", () => this.sessionHandlers.onPrevious({ lockScreen: true }));
    set("nexttrack", () => this.sessionHandlers.onNext({ lockScreen: true }));
    set("stop", () => {
      this.stop();
      this.sessionHandlers.onPause();
    });

    this.applyIOSSeekConfig();
    if (this.registerSeekToHandlerInstalled()) installed.push("seekto");

    if (!isIOSDevice()) {
      set("seekbackward", (details) => {
        const offset = details.seekOffset ?? 10;
        this.seek(this.audio.currentTime - offset);
        this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      });
      set("seekforward", (details) => {
        const offset = details.seekOffset ?? 10;
        this.seek(this.audio.currentTime + offset);
        this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      });
    }

    setAudioDiagnostics({
      ios: isIOSDevice(),
      pwa: isStandalonePWA(),
      iosMode: isIOSDevice() ? "ios-seekto-prevnext" : "desktop-full",
      installedHandlers: installed,
    });
  }

  private registerSeekToHandlerInstalled(): boolean {
    return (
      "mediaSession" in navigator &&
      typeof navigator.mediaSession.setPositionState === "function"
    );
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

  /** Foreground resume: на iOS не трогаем (audio.play() без жеста бесполезен и роняет pipeline). */
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

  private releaseAudioGraph(): void {
    this.teardownAnalyser();
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.analyser = null;
    }
  }

  /**
   * PWA/iOS: audio.play() должен вызываться синхронно внутри Media Session play handler,
   * иначе теряется user activation и звук пропадает после паузы на lock screen.
   */
  private handleMediaSessionPlay(onSync?: () => void): void {
    ensureNavigatorAudioSession();
    this.ensureAudioInDom();
    this.audio.muted = false;
    this.audio.playbackRate = 1;
    logAudioEvent("mediaSession:play", this.audio);

    const onSuccess = () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
      }
      this.setStatus("playing");
      this.updatePositionState();
      onSync?.();
    };

    const retry = () => {
      const src = this.audio.currentSrc || this.audio.src;
      const position = this.audio.currentTime;
      if (!src) return;
      this.audio.src = src;
      this.audio.currentTime = position;
      const p = this.audio.play();
      if (p !== undefined) p.then(onSuccess).catch(() => {});
      else onSuccess();
    };

    const promise = this.audio.play();
    if (promise !== undefined) {
      promise.then(onSuccess).catch(retry);
    } else {
      onSuccess();
    }
  }

  private handleMediaSessionPause(onSync?: () => void): void {
    ensureNavigatorAudioSession();
    logAudioEvent("mediaSession:pause", this.audio);
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      setAudioDiagnostics({ mediaSessionPlaybackState: "paused" });
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

  /** Позиция для бегунка на lock screen iOS (Media Session API) */
  private updatePositionState(): void {
    if (!("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (this.status === "stopped" || this.status === "idle" || this.status === "loading") return;

    const duration = this.getEffectiveDuration();
    const position = this.audio.currentTime;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;

    const playbackRate =
      this.status === "playing" && this.audio.playbackRate > 0 ? this.audio.playbackRate : 1;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.max(0, Math.min(position, duration)),
      });
    } catch {
      /* Safari отклоняет невалидное состояние */
    }
  }

  /** Синхронная смена трека с lock screen (без await load/canplay) */
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
    if (startPosition > 0) {
      this.audio.currentTime = startPosition;
    }
    this.setStatus("paused");
  }

  /**
   * Единый СИНХРОННЫЙ путь старта трека на iOS lock screen (смена трека, авто-переход, резюм):
   * ставит новый src и вызывает play() В ТОМ ЖЕ тике, что и инициатор (жест ⏮⏭/play или событие
   * `ended`). Это сохраняет user activation / право на продолжение аудио-сессии — без await,
   * который ранее разрывал контекст (авто-переход не играл, резюм глох / уходил в Apple Music).
   * Позиция (для резюма) восстанавливается на loadedmetadata; до завершения seek звук заглушён,
   * чтобы не было слышно старта с нуля.
   */
  playFreshSync(url: string, startPosition = 0, duration = 0, onDone?: () => void): void {
    ensureNavigatorAudioSession();
    this.ensureAudioInDom();
    if (this.objectUrl && this.objectUrl !== url) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (duration > 0) this.mediaDuration = duration;
    this.audio.playbackRate = 1;
    this.audio.muted = startPosition > 0;
    this.audio.src = url;

    if (startPosition > 0) {
      const restorePosition = () => {
        this.audio.removeEventListener("loadedmetadata", restorePosition);
        const unmute = () => {
          this.audio.removeEventListener("seeked", unmute);
          this.audio.muted = false;
        };
        this.audio.addEventListener("seeked", unmute);
        window.setTimeout(unmute, 1000);
        try {
          this.audio.currentTime = startPosition;
        } catch {
          this.audio.muted = false;
        }
      };
      this.audio.addEventListener("loadedmetadata", restorePosition);
    }

    logAudioEvent("playFreshSync", this.audio);

    const onSuccess = () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
      }
      this.setStatus("playing");
      this.updatePositionState();
      onDone?.();
    };

    const p = this.audio.play();
    if (p !== undefined) {
      p.then(onSuccess).catch(() => {
        this.audio.muted = false;
        onDone?.();
      });
    } else {
      onSuccess();
    }
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
  }

  async play(): Promise<void> {
    ensureNavigatorAudioSession();
    this.audio.muted = false;
    this.audio.playbackRate = 1;

    // iOS PWA / hidden: единый синхронный путь через Media Session play (сохраняет user activation).
    if (isPageHidden() || (isIOSDevice() && isStandalonePWA() && this.audio.paused)) {
      await new Promise<void>((resolve) => this.handleMediaSessionPlay(resolve));
      return;
    }

    await this.audio.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
      setAudioDiagnostics({ mediaSessionPlaybackState: "playing" });
    }
    if (!isIOSDevice()) {
      await this.ensureAnalyser();
    }
    this.updatePositionState();
  }

  pause(): void {
    logAudioEvent("pause:request", this.audio);
    this.audio.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      setAudioDiagnostics({ mediaSessionPlaybackState: "paused" });
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
    handlers: MediaSessionHandlers,
    queueInfo?: { queueLength: number; queueIndex: number },
  ): void {
    if (!("mediaSession" in navigator)) return;

    this.sessionHandlers = handlers;

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

    // Нет обложки → плейсхолдер QHub Music (blob URL надёжнее на iOS lock screen).
    prefetchTrackPlaceholderArtwork();
    const artwork: MediaImage[] =
      track.hasCover && track.coverArtUrl
        ? buildCoverArtwork(track.coverArtUrl)
        : buildPlaceholderArtwork();

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: albumLabel,
        artwork,
      });
    } catch {
      /* Safari иногда отклоняет artwork — повторим без обложки не делаем, UI уже с плейсхолдером */
    }

    // КЛЮЧЕВОЕ: iOS сбрасывает раскладку кнопок при смене metadata — переустанавливаем
    // ВЕСЬ набор хендлеров (play/pause/⏮⏭/stop) + seek-конфиг, иначе ⏮⏭ становятся серыми.
    this.registerMediaSessionHandlers();
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
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
  }
}
