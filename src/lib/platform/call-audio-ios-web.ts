import { isIOSDevice } from "@/lib/platform/device";

type MediaElementWithSink = HTMLMediaElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

/** iOS 26+ Safari/PWA exposes setSinkId on media elements. */
export function supportsIosWebSinkId(): boolean {
  if (!isIOSDevice() || typeof document === "undefined") return false;
  const probe = document.createElement("audio");
  return typeof probe.setSinkId === "function";
}

/**
 * Use setSinkId when available on iOS Safari/PWA.
 * On newer iPhones this is more reliable than element-type routing (<audio>/<video>)
 * and avoids sticky earpiece output during video calls.
 */
export function useIosSinkIdCallRouting(): boolean {
  return supportsIosWebSinkId();
}

export async function findIosAudioOutputId(speaker: boolean): Promise<string | undefined> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return undefined;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  if (outputs.length === 0) return undefined;

  const matchesSpeaker = (value: string) =>
    /speaker|громк|built.?in.?speaker|main|громкоговор/i.test(value);
  const matchesEarpiece = (value: string) =>
    /receiver|earpiece|трубк|built.?in.?receiver/i.test(value);
  const describe = (device: MediaDeviceInfo) =>
    `${device.label ?? ""} ${device.deviceId ?? ""}`.toLowerCase();
  const normalized = outputs.map((d) => ({ id: d.deviceId, descriptor: describe(d) }));

  for (const device of normalized) {
    if (speaker && matchesSpeaker(device.descriptor)) return device.id;
    if (!speaker && matchesEarpiece(device.descriptor)) return device.id;
  }

  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    const firstIsReceiver = first ? matchesEarpiece(first.descriptor) : false;
    const lastIsReceiver = last ? matchesEarpiece(last.descriptor) : false;
    if (speaker) {
      if (firstIsReceiver && !lastIsReceiver) return last?.id;
      if (lastIsReceiver && !firstIsReceiver) return first?.id;
      return undefined;
    }
    if (firstIsReceiver) return first.id;
    if (lastIsReceiver) return last?.id;
    return undefined;
  }
  // For single/ambiguous outputs keep legacy element-type routing as source of truth.
  return undefined;
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
