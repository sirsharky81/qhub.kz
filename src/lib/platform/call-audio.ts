import { registerPlugin } from "@capacitor/core";
import { prepareAudioSessionForCall } from "@/lib/audio-session";
import { isIOSDevice } from "./device";
import { getNativePlatform, isNativePlatform } from "./runtime";

export interface CallAudioPlugin {
  prepare(): Promise<void>;
  setSpeaker(options: { enabled: boolean }): Promise<void>;
  release(): Promise<void>;
}

const CallAudioNative = registerPlugin<CallAudioPlugin>("CallAudio", {
  web: () => import("./call-audio.web").then((m) => new m.CallAudioWeb()),
});

/** Capacitor shell can route speaker/earpiece via native AudioManager / AVAudioSession. */
export function hasNativeCallAudioRouting(): boolean {
  if (!isNativePlatform()) return false;
  const platform = getNativePlatform();
  return platform === "android" || platform === "ios";
}

/** iOS WebKit silences off-screen WebRTC playback — keep a 1px in-viewport element. */
export function shouldKeepMediaElementVisible(): boolean {
  return isIOSDevice();
}

/** iOS Safari/PWA speaker hack (<video> vs <audio>) when native routing is unavailable. */
export function usesWebIosElementRouting(): boolean {
  return isIOSDevice() && !hasNativeCallAudioRouting();
}

export async function prepareCallAudioOutput(): Promise<void> {
  prepareAudioSessionForCall();
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.prepare();
  } catch {
    // Native plugin missing in older builds — web fallbacks still apply.
  }
}

export async function setCallSpeakerEnabled(enabled: boolean): Promise<void> {
  prepareAudioSessionForCall();
  if (!hasNativeCallAudioRouting()) return;
  try {
    await CallAudioNative.setSpeaker({ enabled });
  } catch {
    // Ignore — element routing may still work on web iOS.
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
