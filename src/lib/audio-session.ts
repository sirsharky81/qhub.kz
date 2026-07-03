type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
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
