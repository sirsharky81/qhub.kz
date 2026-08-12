// Ambient type declarations mirroring the Google Cast Web Sender SDK's global
// `cast` / `chrome.cast` objects, loaded at runtime from gstatic.com (see
// cast-sdk.ts). These exist only so consumers of this codebase get type
// checking against the real runtime API without depending on an npm package
// (Google does not publish official types for the Web Sender SDK).

export {};

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: typeof cast;
    chrome?: { cast?: typeof chrome.cast };
  }

  namespace cast {
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

  namespace chrome {
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
}
