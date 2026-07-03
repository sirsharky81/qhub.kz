import { isIOSDevice } from "@/lib/platform/device";

type MediaElementWithSink = HTMLMediaElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

/** iOS 26+ Safari/PWA: setSinkId works on a WebAudio relay element, not on raw WebRTC tracks. */
export function supportsIosWebSinkId(): boolean {
  if (!isIOSDevice() || typeof document === "undefined") return false;
  const probe = document.createElement("audio");
  return typeof probe.setSinkId === "function";
}

export async function findIosAudioOutputId(speaker: boolean): Promise<string | undefined> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return undefined;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  if (outputs.length === 0) return undefined;

  const matchesSpeaker = (label: string) =>
    /speaker|громк|built.?in.?speaker|main|громкоговор/i.test(label);
  const matchesEarpiece = (label: string) =>
    /receiver|earpiece|трубк|iphone|built.?in.?receiver/i.test(label);

  for (const device of outputs) {
    const label = device.label.toLowerCase();
    if (speaker && matchesSpeaker(label)) return device.deviceId;
    if (!speaker && matchesEarpiece(label)) return device.deviceId;
  }

  if (outputs.length >= 2) {
    return speaker ? outputs[outputs.length - 1]?.deviceId : outputs[0]?.deviceId;
  }
  return outputs[0]?.deviceId;
}

export async function applySinkIdToElement(
  el: HTMLMediaElement,
  speaker: boolean,
): Promise<boolean> {
  const setSinkId = (el as MediaElementWithSink).setSinkId;
  if (!setSinkId) return false;
  const deviceId = await findIosAudioOutputId(speaker);
  if (!deviceId) return false;
  try {
    await setSinkId.call(el, deviceId);
    return true;
  } catch {
    return false;
  }
}
