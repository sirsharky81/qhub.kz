import { prepareAudioSessionForCall } from "@/lib/audio-session";

let wakeLock: WakeLockSentinel | null = null;
let releaseWakeLockOnVisibility: (() => void) | null = null;
let keepScreenOn = false;

/** Tell iOS the app is in an active voice call — resists ducking from other apps' sounds. */
export async function activateCallMediaSession(
  peerTitle: string,
  options?: { speakerOn?: boolean },
): Promise<void> {
  if (typeof navigator === "undefined") return;
  prepareAudioSessionForCall();

  const speakerOn = options?.speakerOn ?? false;
  keepScreenOn = speakerOn;

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Звонок",
        artist: peerTitle || "QHub",
      });
      navigator.mediaSession.playbackState = speakerOn ? "playing" : "none";
    } catch {
      // Safari versions vary.
    }
  }

  if (speakerOn) {
    await requestCallWakeLock();
  } else {
    releaseCallWakeLock();
  }
}

async function requestCallWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    wakeLock?.release().catch(() => {});
    wakeLock = await navigator.wakeLock.request("screen");
    if (!releaseWakeLockOnVisibility && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible" && keepScreenOn) {
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

function releaseCallWakeLock(): void {
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
}

export function releaseCallMediaSession(): void {
  keepScreenOn = false;
  releaseWakeLockOnVisibility?.();
  releaseWakeLockOnVisibility = null;
  releaseCallWakeLock();

  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    // Best-effort.
  }
}
