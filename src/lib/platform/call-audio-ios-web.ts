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

/**
 * Pick the receiver (earpiece) or loudspeaker deviceId on iOS 18+.
 *
 * Field data (session debug-1c0a94, iOS 18.7 PWA): labels are LOCALIZED by
 * system language — Russian devices report "Приемник" (receiver) and
 * "Динамик" (speaker), plus a pseudo-device `deviceId: "default"` labelled
 * "По умолчанию - Динамик". WebKit builds that default label as
 * "<Default> - <real default device label>" (MediaDevices.cpp), so the real
 * loudspeaker's label is a substring of the default label — which gives a
 * locale-independent structural rule: among the non-default outputs, the one
 * whose label is NOT contained in the default label is the receiver.
 */
export async function findIosAudioOutputId(speaker: boolean): Promise<string | undefined> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return undefined;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  if (outputs.length === 0) return undefined;

  const matchesSpeaker = (value: string) =>
    /speaker|динамик|громк|haut-parleur|lautsprecher|altavoz|hoparl|스피커|扬声器|スピーカー/i.test(value);
  const matchesEarpiece = (value: string) =>
    /receiver|earpiece|при[её]мник|трубк|récepteur|hörer|auricular|kulakl|受话|受話|리시버/i.test(value);

  const defaultDevice = outputs.find((d) => d.deviceId === "default");
  const real = outputs.filter((d) => d.deviceId !== "default" && d.deviceId);

  // 1) Label match (localized names included).
  for (const device of real) {
    const label = (device.label ?? "").toLowerCase();
    if (!label) continue;
    if (speaker && matchesSpeaker(label)) return device.deviceId;
    if (!speaker && matchesEarpiece(label)) return device.deviceId;
  }

  // 2) Structural rule against the "Default - <speaker>" pseudo-device.
  const defaultLabel = defaultDevice?.label ?? "";
  if (defaultLabel) {
    const insideDefault = real.filter((d) => d.label && defaultLabel.includes(d.label));
    const outsideDefault = real.filter((d) => d.label && !defaultLabel.includes(d.label));
    if (speaker && insideDefault.length === 1) return insideDefault[0]!.deviceId;
    if (!speaker && outsideDefault.length === 1) return outsideDefault[0]!.deviceId;
  }

  // 3) Unlabeled outputs: positional guess (receiver first, speaker last).
  const hasReadableLabels = outputs.some((d) => Boolean(d.label?.trim()));
  if (!hasReadableLabels && real.length >= 2) {
    return speaker ? real[real.length - 1]!.deviceId : real[0]!.deviceId;
  }

  if (speaker) return defaultDevice?.deviceId;
  // No confident receiver candidate — better to stay on the loudspeaker than
  // to actively select it via a wrong sink.
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
