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

/**
 * Keep duplex audio session for live calls.
 *
 * Deliberately does NOT set audioSession.mode = "voice-chat": field debugging
 * (июль 2026, session 480e62/H48) confirmed that setting voice-chat mode on
 * iOS PWA flipped call output to the loudspeaker even when the earpiece
 * <audio> route was mounted correctly. Plain play-and-record routes the
 * receiver (earpiece) as expected.
 */
export function prepareAudioSessionForCall(): void {
  prepareAudioSessionForCapture();
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
 *
 * No "playback" hop here: field debugging (session 480e62/H53) confirmed the
 * playback → auto → play-and-record sequence itself re-routed the call to the
 * loudspeaker on iOS. auto → play-and-record is enough to re-kick routing.
 */
export function recoverAudioSessionAfterInterruption(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
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
