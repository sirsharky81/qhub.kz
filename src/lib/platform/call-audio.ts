import { registerPlugin } from "@capacitor/core";
import { prepareAudioSessionForCall } from "@/lib/audio-session";
import { isIOSDevice } from "./device";
import { getNativePlatform, isNativePlatform } from "./runtime";

export interface CallAudioPlugin {
  prepare(): Promise<void>;
  setSpeaker(options: { enabled: boolean }): Promise<void>;
  setProximity(options: { enabled: boolean }): Promise<void>;
  release(): Promise<void>;
}

const CallAudioNative = registerPlugin<CallAudioPlugin>("CallAudio", {
  web: () => import("./call-audio.web").then((m) => new m.CallAudioWeb()),
});

/**
 * Native speaker routing is only available in the Android Capacitor shell.
 * iOS uses PWA/website only; Android PWA/website has no programmatic routing.
 */
export function hasNativeCallAudioRouting(): boolean {
  return isNativePlatform() && getNativePlatform() === "android";
}

/** iOS WebKit silences off-screen WebRTC playback — keep a 1px in-viewport element. */
export function shouldKeepMediaElementVisible(): boolean {
  return isIOSDevice();
}

/** iOS Safari/PWA legacy hack: loudspeaker via <video>, earpiece via <audio>. */
export function usesWebIosElementRouting(): boolean {
  return isIOSDevice();
}

export async function prepareCallAudioOutput(): Promise<void> {
  prepareAudioSessionForCall();
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.prepare();
    await CallAudioNative.setSpeaker({ enabled: false });
  } catch {
    // Native plugin missing in older Android builds.
  }
}

export async function setCallSpeakerEnabled(enabled: boolean): Promise<void> {
  prepareAudioSessionForCall();
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.setSpeaker({ enabled });
  } catch {
    // Best-effort — element playback may still work.
  }
}

export async function setCallProximityEnabled(enabled: boolean): Promise<void> {
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.setProximity({ enabled });
  } catch {
    // Best-effort.
  }
}

export async function releaseCallAudioOutput(): Promise<void> {
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.release();
  } catch {
    // Best-effort cleanup.
  }
}
