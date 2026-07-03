import {
  getAudioSessionState,
  recoverAudioSessionAfterInterruption,
  subscribeAudioSessionStateChange,
} from "@/lib/audio-session";
import { isIOSDevice } from "@/lib/platform/device";

/**
 * iOS routes call audio to the loudspeaker after transient sounds from other apps
 * (push notifications, banners). Rebuild playback when the session recovers.
 */
export function watchCallAudioInterruptions(onRecover: () => void): () => void {
  if (typeof window === "undefined" || !isIOSDevice()) return () => {};

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      recoverAudioSessionAfterInterruption();
      onRecover();
    }, 200);
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule();
  };

  const onAudioSession = () => {
    const state = getAudioSessionState();
    if (state === "active" || state === null) schedule();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("focus", schedule);
  const unsubSession = subscribeAudioSessionStateChange(onAudioSession);

  return () => {
    if (debounce) clearTimeout(debounce);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", schedule);
    window.removeEventListener("focus", schedule);
    unsubSession();
  };
}
