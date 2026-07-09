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
 * setSinkId-based routing is DISABLED on iOS.
 *
 * Field debugging (июль 2026, session 480e62/H35) confirmed it is harmful in
 * practice: iOS exposes outputs without readable labels, the device guess
 * lands on "default" (= loudspeaker), setSinkId intermittently fails, and
 * WebRTC remote tracks bypass HTMLMediaElement.setSinkId on iOS anyway
 * (see livekit/client-sdk-js#1568). Disabling it restored video-call audio
 * during those tests. Legacy element-type routing (<audio> + play-and-record
 * = earpiece, direct stream on <video> = loudspeaker) is used instead.
 */
export function iosSinkIdCallRoutingEnabled(): boolean {
  return false;
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

  const hasReadableLabels = outputs.some((d) => Boolean(d.label?.trim()));
  if (!hasReadableLabels && outputs.length >= 2) {
    // iOS often exposes receiver + speaker without labels until after getUserMedia.
    return speaker ? outputs[outputs.length - 1]!.deviceId : outputs[0]!.deviceId;
  }

  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    const firstIsReceiver = first ? matchesEarpiece(first.descriptor) : false;
    const lastIsReceiver = last ? matchesEarpiece(last.descriptor) : false;
    if (speaker) {
      if (firstIsReceiver && !lastIsReceiver) return last?.id;
      if (lastIsReceiver && !firstIsReceiver) return first?.id;
      return last?.id;
    }
    if (firstIsReceiver) return first.id;
    if (lastIsReceiver) return last?.id;
    return first?.id;
  }
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

/** Re-enumerate outputs after capture unlocks device labels on iOS. */
export async function refreshIosAudioOutputEnumeration(): Promise<void> {
  if (!supportsIosWebSinkId()) return;
  try {
    await navigator.mediaDevices?.enumerateDevices();
  } catch {
    // Best-effort.
  }
}
