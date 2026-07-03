import { isIOSDevice } from "@/lib/platform/device";

let warmStream: MediaStream | null = null;
let warming: Promise<void> | null = null;

/** Pre-grant mic on iOS PWA — avoids repeated permission prompts between calls. */
export async function warmCallMicrophone(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  if (warmStream?.active) return;
  if (warming) {
    await warming;
    return;
  }
  warming = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      for (const track of stream.getAudioTracks()) {
        track.enabled = false;
      }
      warmStream = stream;
    } catch {
      /* permission denied or unavailable */
    } finally {
      warming = null;
    }
  })();
  await warming;
}

export async function acquireCallMicrophone(): Promise<MediaStream> {
  if (warmStream?.active) {
    const stream = warmStream;
    warmStream = null;
    for (const track of stream.getAudioTracks()) {
      track.enabled = true;
    }
    return stream;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export function releaseCallMicrophone(stream: MediaStream | null): void {
  if (!stream) return;
  if (isIOSDevice()) {
    for (const track of stream.getAudioTracks()) {
      track.enabled = false;
    }
    warmStream = stream;
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function discardWarmMicrophone(): void {
  if (!warmStream) return;
  for (const track of warmStream.getTracks()) {
    track.stop();
  }
  warmStream = null;
}
