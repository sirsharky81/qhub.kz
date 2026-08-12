"use client";

import type { CastResolvedMedia } from "./types";
import { getCastReceiverId } from "./urls";

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: typeof cast;
    chrome?: { cast?: typeof chrome.cast };
  }
}

declare namespace cast {
  namespace framework {
    class CastContext {
      static getInstance(): CastContext;
      setOptions(options: CastOptions): void;
      getCastState(): CastState;
      addEventListener(type: CastContextEventType, handler: (ev: Event) => void): void;
      removeEventListener(type: CastContextEventType, handler: (ev: Event) => void): void;
      requestSession(): Promise<cast.framework.CastSession>;
      getCurrentSession(): cast.framework.CastSession | null;
    }
    class CastSession {
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>;
    }
    class RemotePlayer {
      isConnected: boolean;
      isMediaLoaded: boolean;
      playerState: string;
      currentTime: number;
      duration: number;
    }
    class RemotePlayerController {
      constructor(player: RemotePlayer);
      addEventListener(type: RemotePlayerEventType, handler: () => void): void;
      playOrPause(): void;
      seek(): void;
      stop(): void;
    }
    enum CastContextEventType {
      CAST_STATE_CHANGED = "caststatechanged",
      SESSION_STATE_CHANGED = "sessionstatechanged",
    }
    enum RemotePlayerEventType {
      ANY_CHANGE = "anyChange",
    }
    enum CastState {
      NO_DEVICES_AVAILABLE = "NO_DEVICES_AVAILABLE",
      NOT_CONNECTED = "NOT_CONNECTED",
      CONNECTING = "CONNECTING",
      CONNECTED = "CONNECTED",
    }
    enum SessionState {
      SESSION_STARTED = "SESSION_STARTED",
      SESSION_ENDED = "SESSION_ENDED",
    }
    interface CastOptions {
      receiverApplicationId: string;
      autoJoinPolicy: chrome.cast.AutoJoinPolicy;
    }
  }
}

declare namespace chrome {
  namespace cast {
    enum AutoJoinPolicy {
      ORIGIN_SCOPED = "origin_scoped",
    }
    namespace media {
      class MediaInfo {
        constructor(contentId: string, contentType: string);
        streamType: StreamType;
        metadata: GenericMediaMetadata | MovieMediaMetadata;
      }
      class LoadRequest {
        constructor(mediaInfo: MediaInfo);
        currentTime: number;
      }
      class GenericMediaMetadata {
        title?: string;
        subtitle?: string;
        images?: { url: string }[];
      }
      class MovieMediaMetadata {
        title?: string;
        subtitle?: string;
        images?: { url: string }[];
      }
      enum StreamType {
        BUFFERED = "BUFFERED",
        LIVE = "LIVE",
      }
    }
  }
}

const CAST_SCRIPT =
  "https://www.gstatic.com/cast/sdk/libs/sender/1.0/cast_framework.js?loadCastFramework=1";

let loadPromise: Promise<boolean> | null = null;

function loadCastScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.cast?.framework?.CastContext) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    window.__onGCastApiAvailable = (isAvailable) => {
      resolve(Boolean(isAvailable && window.cast?.framework?.CastContext));
    };

    if (document.querySelector(`script[src^="https://www.gstatic.com/cast/sdk/libs/sender"]`)) {
      const poll = window.setInterval(() => {
        if (window.cast?.framework?.CastContext) {
          window.clearInterval(poll);
          resolve(true);
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(poll);
        resolve(Boolean(window.cast?.framework?.CastContext));
      }, 8000);
      return;
    }

    const script = document.createElement("script");
    script.src = CAST_SCRIPT;
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);

    window.setTimeout(() => {
      resolve(Boolean(window.cast?.framework?.CastContext));
    }, 8000);
  });

  return loadPromise;
}

export async function initCastSdk(): Promise<boolean> {
  const ok = await loadCastScript();
  if (!ok || !window.cast?.framework?.CastContext || !window.chrome?.cast) return false;

  const ctx = window.cast.framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: getCastReceiverId(),
    autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  return true;
}

export function isCastApiAvailable(): boolean {
  return Boolean(window.cast?.framework?.CastContext);
}

export async function loadMediaOnCast(media: CastResolvedMedia): Promise<void> {
  const ready = await initCastSdk();
  if (!ready || !window.cast?.framework || !window.chrome?.cast) {
    throw new Error("Google Cast недоступен в этом браузере");
  }

  const ctx = window.cast.framework.CastContext.getInstance();
  let session = ctx.getCurrentSession();
  if (!session) {
    session = await ctx.requestSession();
  }

  const info = new window.chrome.cast.media.MediaInfo(media.streamUrl, media.contentType);
  info.streamType = window.chrome.cast.media.StreamType.BUFFERED;
  const metadata = new window.chrome.cast.media.MovieMediaMetadata();
  metadata.title = media.title;
  if (media.poster) {
    metadata.images = [{ url: media.poster }];
  }
  info.metadata = metadata;

  const request = new window.chrome.cast.media.LoadRequest(info);
  await session.loadMedia(request);
}

export function createRemotePlayerController(): {
  player: cast.framework.RemotePlayer;
  controller: cast.framework.RemotePlayerController;
} | null {
  if (!window.cast?.framework) return null;
  const player = new window.cast.framework.RemotePlayer();
  const controller = new window.cast.framework.RemotePlayerController(player);
  return { player, controller };
}

export function getCastStateLabel(state: string): string {
  switch (state) {
    case "NO_DEVICES_AVAILABLE":
      return "Устройства Cast не найдены";
    case "NOT_CONNECTED":
      return "Не подключено";
    case "CONNECTING":
      return "Подключение…";
    case "CONNECTED":
      return "Подключено к TV";
    default:
      return state;
  }
}
