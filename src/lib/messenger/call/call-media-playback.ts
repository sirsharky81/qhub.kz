import {
  kickAudioSessionAfterCapture,
  prepareAudioSessionForCall,
  recoverAudioSessionAfterInterruption,
} from "@/lib/audio-session";
import {
  applySinkIdToElement,
  iosSinkIdCallRoutingEnabled,
} from "@/lib/platform/call-audio-ios-web";
import { isIOSDevice } from "@/lib/platform/device";

const CALL_MEDIA_ATTR = "data-qhub-call-media";

/** 16-byte silent WAV — unlocks iOS Safari audio element during user gesture. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";

let earpieceEl: HTMLAudioElement | null = null;
let speakerEl: HTMLVideoElement | null = null;
let defaultEl: HTMLAudioElement | null = null;
let relayCtx: AudioContext | null = null;
let relaySource: MediaStreamAudioSourceNode | null = null;
let relayDestination: MediaStreamAudioDestinationNode | null = null;
let relayEl: HTMLAudioElement | null = null;
let relayStream: MediaStream | null = null;
const unlocked = { audio: false, video: false };

export type CallMediaRoute = "sink" | "relay-video" | "relay-audio" | "default";

function styleCallMediaElement(el: HTMLMediaElement, inViewport: boolean): void {
  Object.assign(el.style, {
    position: "fixed",
    left: inViewport ? "0" : "-9999px",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: inViewport ? "0.001" : "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
}

function configureCallMediaElement(el: HTMLMediaElement): void {
  el.autoplay = true;
  el.muted = false;
  el.volume = 1;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.setAttribute(CALL_MEDIA_ATTR, "true");
  if ("playsInline" in el) {
    (el as HTMLVideoElement).playsInline = true;
  }
  styleCallMediaElement(el, isIOSDevice());
}

function destroyElement(el: HTMLMediaElement | null): void {
  if (!el) return;
  el.muted = true;
  el.volume = 0;
  el.pause();
  el.srcObject = null;
  el.removeAttribute("src");
  el.removeAttribute(CALL_MEDIA_ATTR);
  el.remove();
}

function destroyEarpieceElement(): void {
  destroyElement(earpieceEl);
  earpieceEl = null;
  unlocked.audio = false;
}

function destroySpeakerElement(): void {
  destroyElement(speakerEl);
  speakerEl = null;
  unlocked.video = false;
}

/**
 * Tear down relay nodes/element but keep the AudioContext alive. The context
 * must survive route toggles: it can only be (re)started from a user gesture
 * on iOS, so closing it mid-call would leave the earpiece route permanently
 * silent after a speaker → earpiece switch.
 */
function teardownRelayNodes(): void {
  relaySource?.disconnect();
  relaySource = null;
  relayDestination?.disconnect();
  relayDestination = null;
  relayStream = null;
  destroyElement(relayEl);
  relayEl = null;
}

function destroyRelayGraph(): void {
  teardownRelayNodes();
  if (relayCtx) {
    void relayCtx.close();
    relayCtx = null;
  }
}

/**
 * Create/resume the relay AudioContext synchronously inside a user gesture.
 * An AudioContext created later (during async stream attach) starts suspended
 * on iOS and resume() outside a gesture may never succeed — that manifested
 * as completely silent earpiece calls between iPhones.
 */
function primeRelayContext(): void {
  try {
    relayCtx = relayCtx ?? new AudioContext();
    if (relayCtx.state !== "running") {
      void relayCtx.resume().catch(() => {});
    }
  } catch {
    // WebAudio unavailable — legacy element playback will still try.
  }
}

function createEarpieceElement(): HTMLAudioElement {
  destroyEarpieceElement();
  earpieceEl = document.createElement("audio");
  configureCallMediaElement(earpieceEl);
  document.body.appendChild(earpieceEl);
  return earpieceEl;
}

function createSpeakerElement(): HTMLVideoElement {
  destroySpeakerElement();
  speakerEl = document.createElement("video");
  configureCallMediaElement(speakerEl);
  document.body.appendChild(speakerEl);
  return speakerEl;
}

function ensureDefaultElement(): HTMLAudioElement {
  if (!defaultEl) {
    defaultEl = document.createElement("audio");
    configureCallMediaElement(defaultEl);
    styleCallMediaElement(defaultEl, false);
    document.body.appendChild(defaultEl);
  }
  return defaultEl;
}

function unlockElement(el: HTMLMediaElement, kind: "audio" | "video"): void {
  if (!isIOSDevice()) return;
  if (kind === "audio" && unlocked.audio) return;
  if (kind === "video" && unlocked.video) return;

  prepareAudioSessionForCall();
  el.srcObject = null;
  el.src = SILENT_WAV;
  try {
    const ret = el.play();
    if (ret && typeof ret.then === "function") {
      void ret
        .then(() => {
          if (kind === "audio") unlocked.audio = true;
          else unlocked.video = true;
          el.pause();
          el.removeAttribute("src");
        })
        .catch(() => {});
    }
  } catch {
    // Best-effort unlock during user gesture.
  }
}

/** iOS: route WebRTC through WebAudio so output element swap does not renegotiate tracks. */
export function useIosWebAudioRelay(): boolean {
  return isIOSDevice();
}

export function getCallMediaRoute(speakerOn: boolean): CallMediaRoute {
  if (!isIOSDevice()) return "default";
  if (iosSinkIdCallRoutingEnabled()) return "sink";
  return speakerOn ? "relay-video" : "relay-audio";
}

/**
 * Must run synchronously inside click/touchend (before any await).
 * Only unlocks the element for the target route — keeping both in DOM forces loudspeaker on iOS.
 */
export function primeCallMediaPlayback(speakerOn = false): void {
  if (typeof document === "undefined") return;
  prepareAudioSessionForCall();
  if (!isIOSDevice()) return;

  if (iosSinkIdCallRoutingEnabled()) {
    if (!relayEl) {
      relayEl = document.createElement("audio");
      configureCallMediaElement(relayEl);
      document.body.appendChild(relayEl);
    }
    destroyEarpieceElement();
    destroySpeakerElement();
    unlockElement(relayEl, "audio");
    return;
  }

  if (speakerOn) {
    destroyEarpieceElement();
    const el = speakerEl ?? createSpeakerElement();
    unlockElement(el, "video");
    return;
  }

  destroySpeakerElement();
  const el = earpieceEl ?? createEarpieceElement();
  unlockElement(el, "audio");
  primeRelayContext();
}

async function ensureRelayGraph(stream: MediaStream): Promise<MediaStream> {
  relayCtx = relayCtx ?? new AudioContext();
  if (relayCtx.state !== "running") {
    await relayCtx.resume().catch(() => {});
  }

  if (relaySource?.mediaStream === stream && relayStream) {
    return relayStream;
  }

  relaySource?.disconnect();
  relayDestination?.disconnect();

  relaySource = relayCtx.createMediaStreamSource(stream);
  relayDestination = relayCtx.createMediaStreamDestination();
  relaySource.connect(relayDestination);
  relayStream = relayDestination.stream;
  return relayStream;
}

async function mountSinkRelayOutput(
  stream: MediaStream,
  speakerOn: boolean,
): Promise<HTMLMediaElement | null> {
  if (speakerOn) {
    const hasVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
    if (hasVideo) {
      teardownRelayNodes();
      destroyEarpieceElement();
      const el = speakerEl ?? createSpeakerElement();
      el.srcObject = stream;
      await applySinkIdToElement(el, true);
      return el;
    }
  }

  destroyEarpieceElement();
  destroySpeakerElement();

  const routed = await ensureRelayGraph(stream);

  if (!relayEl) {
    relayEl = document.createElement("audio");
    configureCallMediaElement(relayEl);
    document.body.appendChild(relayEl);
  }

  relayEl.srcObject = routed;
  const routedOk = await applySinkIdToElement(relayEl, speakerOn);
  if (routedOk) return relayEl;
  if (!speakerOn) return relayEl;
  return null;
}

async function mountLegacyRelayOutput(
  stream: MediaStream,
  speakerOn: boolean,
): Promise<HTMLMediaElement> {
  if (speakerOn) {
    // iOS routes loudspeaker only for direct WebRTC on <video>, not WebAudio relay.
    teardownRelayNodes();
    destroyEarpieceElement();
    // Reuse the element unlocked during the user gesture — recreating it here
    // would lose the autoplay unlock and risk silent playback.
    const el = speakerEl ?? createSpeakerElement();
    el.srcObject = stream;
    return el;
  }

  destroySpeakerElement();
  const routed = await ensureRelayGraph(stream);
  const el = earpieceEl ?? createEarpieceElement();
  el.srcObject = routed;
  return el;
}

/** Attach remote stream to the correct output element. Only one output element exists on iOS. */
export async function attachCallMediaStream(
  stream: MediaStream,
  speakerOn: boolean,
): Promise<HTMLMediaElement> {
  if (!isIOSDevice()) {
    const el = ensureDefaultElement();
    el.srcObject = stream;
    return el;
  }

  kickAudioSessionAfterCapture();

  const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
  // Direct WebRTC on <video> only when loudspeaker + live video track (iOS quirk).
  const useDirectVideo = hasLiveVideo && speakerOn;

  if (useDirectVideo) {
    teardownRelayNodes();
    destroyEarpieceElement();
    const el = speakerEl ?? createSpeakerElement();
    el.srcObject = stream;
    if (iosSinkIdCallRoutingEnabled()) {
      await applySinkIdToElement(el, speakerOn);
    }
    return el;
  }

  if (iosSinkIdCallRoutingEnabled()) {
    const sinkEl = await mountSinkRelayOutput(stream, speakerOn);
    if (sinkEl) return sinkEl;
  }

  return mountLegacyRelayOutput(stream, speakerOn);
}

/** Full pipeline reset — needed after iOS audio-session interruption or speaker toggle. */
export async function rebuildCallMediaStream(
  stream: MediaStream,
  speakerOn: boolean,
): Promise<HTMLMediaElement> {
  if (!isIOSDevice()) {
    const el = ensureDefaultElement();
    el.srcObject = stream;
    return el;
  }

  destroyEarpieceElement();
  destroySpeakerElement();
  // Keep the AudioContext: it can only be restarted from a user gesture,
  // and interruption recovery runs without one.
  teardownRelayNodes();
  unlocked.audio = false;
  unlocked.video = false;

  recoverAudioSessionAfterInterruption();
  kickAudioSessionAfterCapture();
  prepareAudioSessionForCall();

  return attachCallMediaStream(stream, speakerOn);
}

/** Reset leftover media elements/unlock flags before a new call. */
export function resetCallMediaForNewCall(): void {
  releaseCallMediaPlayback();
}

/** Swap loudspeaker route without rebuilding the WebAudio relay graph. */
export async function switchCallSpeakerRoute(
  stream: MediaStream | null,
  speakerOn: boolean,
): Promise<HTMLMediaElement | null> {
  if (!isIOSDevice()) return null;

  kickAudioSessionAfterCapture();
  prepareAudioSessionForCall();

  if (iosSinkIdCallRoutingEnabled()) {
    if (!relayEl) {
      if (!stream) return null;
      const sinkEl = await mountSinkRelayOutput(stream, speakerOn);
      if (sinkEl) return sinkEl;
      return mountLegacyRelayOutput(stream, speakerOn);
    }
    const routedOk = await applySinkIdToElement(relayEl, speakerOn);
    if (routedOk) return relayEl;
    teardownRelayNodes();
    const fallbackStream = stream ?? relayStream;
    if (!fallbackStream) return null;
    return mountLegacyRelayOutput(fallbackStream, speakerOn);
  }

  const routed = relayStream ?? (stream && !speakerOn ? await ensureRelayGraph(stream) : null);

  if (speakerOn) {
    if (!stream) return null;
    teardownRelayNodes();
    destroyEarpieceElement();
    const el = speakerEl ?? createSpeakerElement();
    el.srcObject = stream;
    return el;
  }

  if (!routed) return null;

  destroySpeakerElement();
  const el = earpieceEl ?? createEarpieceElement();
  el.srcObject = routed;
  return el;
}

/** @deprecated Use switchCallSpeakerRoute */
export async function applyCallSpeakerRoute(
  el: HTMLMediaElement,
  speakerOn: boolean,
): Promise<void> {
  if (iosSinkIdCallRoutingEnabled()) {
    await applySinkIdToElement(el, speakerOn);
  }
}

/** WebKit bug #196539: pause() then play() revives silent WebRTC playback on iOS.
 *
 * Must NOT call recoverAudioSessionAfterInterruption() here: this runs on
 * every playback retry, and audio-session type flips on each play were one of
 * the confirmed causes of calls jumping to the loudspeaker (session 480e62).
 * Interruption recovery has its own dedicated path (rebuildCallMediaStream).
 */
export async function playCallMedia(el: HTMLMediaElement): Promise<boolean> {
  prepareAudioSessionForCall();
  try {
    el.muted = false;
    el.volume = 1;
    if (isIOSDevice()) {
      await el.play();
      el.pause();
      await el.play();
    } else {
      await el.play();
    }
    return !el.paused && !el.ended;
  } catch {
    return false;
  }
}

export function releaseCallMediaPlayback(): void {
  destroyRelayGraph();
  destroyEarpieceElement();
  destroySpeakerElement();
  if (defaultEl) {
    destroyElement(defaultEl);
    defaultEl = null;
  }
}

export function purgeOrphanedCallMediaElements(): void {
  if (typeof document === "undefined") return;
  releaseCallMediaPlayback();
  for (const el of document.querySelectorAll(`[${CALL_MEDIA_ATTR}]`)) {
    destroyElement(el as HTMLMediaElement);
  }
}
