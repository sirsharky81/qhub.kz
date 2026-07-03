import {
  kickAudioSessionAfterCapture,
  prepareAudioSessionForCall,
} from "@/lib/audio-session";
import {
  applySinkIdToElement,
  supportsIosWebSinkId,
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

function destroyRelayGraph(): void {
  relaySource?.disconnect();
  relaySource = null;
  relayDestination?.disconnect();
  relayDestination = null;
  relayStream = null;
  if (relayCtx) {
    void relayCtx.close();
    relayCtx = null;
  }
  destroyElement(relayEl);
  relayEl = null;
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
  if (supportsIosWebSinkId()) return "sink";
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

  if (supportsIosWebSinkId()) {
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
}

async function ensureRelayGraph(stream: MediaStream): Promise<MediaStream> {
  relayCtx = relayCtx ?? new AudioContext();
  if (relayCtx.state === "suspended") {
    await relayCtx.resume();
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
): Promise<HTMLAudioElement> {
  destroyEarpieceElement();
  destroySpeakerElement();

  const routed = await ensureRelayGraph(stream);

  if (!relayEl) {
    relayEl = document.createElement("audio");
    configureCallMediaElement(relayEl);
    document.body.appendChild(relayEl);
  }

  relayEl.srcObject = routed;
  await applySinkIdToElement(relayEl, speakerOn);
  return relayEl;
}

async function mountLegacyRelayOutput(
  stream: MediaStream,
  speakerOn: boolean,
): Promise<HTMLMediaElement> {
  const routed = await ensureRelayGraph(stream);

  if (speakerOn) {
    destroyEarpieceElement();
    const el = createSpeakerElement();
    el.srcObject = routed;
    return el;
  }

  destroySpeakerElement();
  const el = createEarpieceElement();
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

  if (supportsIosWebSinkId()) {
    return mountSinkRelayOutput(stream, speakerOn);
  }

  return mountLegacyRelayOutput(stream, speakerOn);
}

/** Swap loudspeaker route without rebuilding the WebAudio relay graph. */
export async function switchCallSpeakerRoute(
  stream: MediaStream | null,
  speakerOn: boolean,
): Promise<HTMLMediaElement | null> {
  if (!isIOSDevice()) return null;

  kickAudioSessionAfterCapture();
  prepareAudioSessionForCall();

  if (supportsIosWebSinkId()) {
    if (!relayEl) {
      if (!stream) return null;
      return mountSinkRelayOutput(stream, speakerOn);
    }
    await applySinkIdToElement(relayEl, speakerOn);
    return relayEl;
  }

  const routed = relayStream ?? (stream ? await ensureRelayGraph(stream) : null);
  if (!routed) return null;

  if (speakerOn) {
    destroyEarpieceElement();
    const el = createSpeakerElement();
    el.srcObject = routed;
    return el;
  }

  destroySpeakerElement();
  const el = createEarpieceElement();
  el.srcObject = routed;
  return el;
}

/** @deprecated Use switchCallSpeakerRoute */
export async function applyCallSpeakerRoute(
  el: HTMLMediaElement,
  speakerOn: boolean,
): Promise<void> {
  if (supportsIosWebSinkId()) {
    await applySinkIdToElement(el, speakerOn);
  }
}

/** WebKit bug #196539: pause() then play() revives silent WebRTC playback on iOS. */
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
