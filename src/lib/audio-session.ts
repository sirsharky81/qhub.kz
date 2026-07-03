export type AudioSessionState = "active" | "interrupted" | "inactive";

type AudioSession = {
  type: string;
  state?: AudioSessionState;
  onstatechange?: (() => void) | null;
  addEventListener?: (type: "statechange", listener: () => void) => void;
  removeEventListener?: (type: "statechange", listener: () => void) => void;
};

type AudioSessionNavigator = Navigator & {
  audioSession?: AudioSession;
};

/** iOS/WebKit: mic capture requires play-and-record, not playback. */
export function prepareAudioSessionForCapture(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
  nav.audioSession.type = "auto";
  nav.audioSession.type = "play-and-record";
}

/** Keep duplex audio session for live calls. */
export function prepareAudioSessionForCall(): void {
  prepareAudioSessionForCapture();
  if (typeof navigator === "undefined") return;
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session) return;
  const extended = session as AudioSession & { mode?: string };
  if ("mode" in extended) {
    try {
      extended.mode = "voice-chat";
    } catch {
      /* WebKit versions vary */
    }
  }
}

/**
 * After getUserMedia on iOS, Safari often routes playback to the loudspeaker.
 * Toggling auto → play-and-record re-applies earpiece routing for voice calls.
 */
export function kickAudioSessionAfterCapture(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
  nav.audioSession.type = "auto";
  nav.audioSession.type = "play-and-record";
}

/**
 * Re-assert call routing after another app ducks or interrupts our session
 * (push notification sounds, banners, brief backgrounding).
 */
export function recoverAudioSessionAfterInterruption(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
  nav.audioSession.type = "playback";
  nav.audioSession.type = "auto";
  nav.audioSession.type = "play-and-record";
}

export function getAudioSessionState(): AudioSessionState | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as AudioSessionNavigator).audioSession?.state ?? null;
}

export function restoreAudioSessionAfterCapture(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
  nav.audioSession.type = "playback";
  nav.audioSession.type = "auto";
}

export function restoreAudioSessionAfterCall(): void {
  restoreAudioSessionAfterCapture();
}

export function subscribeAudioSessionStateChange(listener: () => void): () => void {
  if (typeof navigator === "undefined") return () => {};
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session) return () => {};

  if (session.addEventListener) {
    session.addEventListener("statechange", listener);
    return () => session.removeEventListener?.("statechange", listener);
  }

  const prev = session.onstatechange;
  const wrapped = () => {
    prev?.();
    listener();
  };
  session.onstatechange = wrapped;
  return () => {
    if (session.onstatechange === wrapped) {
      session.onstatechange = prev ?? null;
    }
  };
}
