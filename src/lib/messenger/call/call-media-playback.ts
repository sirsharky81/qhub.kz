import { prepareAudioSessionForCall } from "@/lib/audio-session";
import { isIOSDevice } from "@/lib/platform/device";

const CALL_MEDIA_ATTR = "data-qhub-call-media";

/** 16-byte silent WAV — unlocks iOS Safari audio element during user gesture. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";

let earpieceEl: HTMLAudioElement | null = null;
let speakerEl: HTMLVideoElement | null = null;
let defaultEl: HTMLAudioElement | null = null;
const unlocked = { audio: false, video: false };

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

function ensureEarpieceElement(): HTMLAudioElement {
  if (!earpieceEl) {
    earpieceEl = document.createElement("audio");
    configureCallMediaElement(earpieceEl);
    document.body.appendChild(earpieceEl);
  }
  return earpieceEl;
}

function ensureSpeakerElement(): HTMLVideoElement {
  if (!speakerEl) {
    speakerEl = document.createElement("video");
    configureCallMediaElement(speakerEl);
    document.body.appendChild(speakerEl);
  }
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

/**
 * Must run synchronously inside click/touchend (before any await).
 * iOS blocks WebRTC playback on elements that were not unlocked during a gesture.
 */
export function primeCallMediaPlayback(): void {
  if (typeof document === "undefined") return;
  prepareAudioSessionForCall();
  if (!isIOSDevice()) return;
  unlockElement(ensureEarpieceElement(), "audio");
  unlockElement(ensureSpeakerElement(), "video");
}

export function getCallMediaElement(speakerOn: boolean): HTMLMediaElement {
  if (isIOSDevice()) {
    return speakerOn ? ensureSpeakerElement() : ensureEarpieceElement();
  }
  return ensureDefaultElement();
}

export function detachInactiveCallMedia(active: HTMLMediaElement): void {
  for (const el of [earpieceEl, speakerEl, defaultEl]) {
    if (!el || el === active) continue;
    detachCallMedia(el);
  }
}

export function detachCallMedia(el: HTMLMediaElement): void {
  el.muted = true;
  el.volume = 0;
  el.pause();
  el.srcObject = null;
  el.removeAttribute("src");
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
  for (const el of [earpieceEl, speakerEl, defaultEl]) {
    if (!el) continue;
    detachCallMedia(el);
    el.remove();
  }
  earpieceEl = null;
  speakerEl = null;
  defaultEl = null;
  unlocked.audio = false;
  unlocked.video = false;
}

export function purgeOrphanedCallMediaElements(): void {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll(`[${CALL_MEDIA_ATTR}]`)) {
    detachCallMedia(el as HTMLMediaElement);
    el.remove();
  }
  earpieceEl = null;
  speakerEl = null;
  defaultEl = null;
  unlocked.audio = false;
  unlocked.video = false;
}
