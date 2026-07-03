import { prepareAudioSessionForCall } from "@/lib/audio-session";

let wakeLock: WakeLockSentinel | null = null;
let releaseWakeLockOnVisibility: (() => void) | null = null;

/** Tell iOS the app is in an active voice call — resists ducking from other apps' sounds. */
export async function activateCallMediaSession(peerTitle: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  prepareAudioSessionForCall();

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Звонок",
        artist: peerTitle || "QHub",
      });
      navigator.mediaSession.playbackState = "playing";
    } catch {
      // Safari versions vary.
    }
  }

  await requestCallWakeLock();
}

async function requestCallWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    wakeLock?.release().catch(() => {});
    wakeLock = await navigator.wakeLock.request("screen");
    if (!releaseWakeLockOnVisibility && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          void requestCallWakeLock();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      releaseWakeLockOnVisibility = () => {
        document.removeEventListener("visibilitychange", onVisibility);
        releaseWakeLockOnVisibility = null;
      };
    }
  } catch {
    // Permission denied or unsupported.
  }
}

export function releaseCallMediaSession(): void {
  releaseWakeLockOnVisibility?.();
  void wakeLock?.release().catch(() => {});
  wakeLock = null;

  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    // Best-effort.
  }
}
