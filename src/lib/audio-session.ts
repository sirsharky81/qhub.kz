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

export function restoreAudioSessionAfterCapture(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as AudioSessionNavigator;
  if (!nav.audioSession) return;
  nav.audioSession.type = "auto";
}

export function restoreAudioSessionAfterCall(): void {
  restoreAudioSessionAfterCapture();
}
