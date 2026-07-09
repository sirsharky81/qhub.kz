import {
  kickAudioSessionAfterCapture,
  prepareAudioSessionForCall,
  recoverAudioSessionAfterInterruption,
} from "@/lib/audio-session";
import {
  applySinkIdToElement,
  findIosAudioOutputId,
  iosSinkIdCallRoutingEnabled,
} from "@/lib/platform/call-audio-ios-web";
import { isIOSDevice } from "@/lib/platform/device";

const CALL_MEDIA_ATTR = "data-qhub-call-media";

/** Field diagnostics for iOS earpiece routing — server drops it unless AGENT_DEBUG=1. */
function debugCallLog(tag: string, data: Record<string, unknown>): void {
  try {
    void fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, t: new Date().toISOString(), ...data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Diagnostics must never affect the call.
  }
}

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
  stopEarpieceSinkWatchers();
  earpieceSinkApplied = false;
  earpieceSinkBusy = false;
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

/**
 * Clear the element's preferred output back to default. WebKit computes the
 * session-wide "receiver preferred" flag from element sink selections, so a
 * stale receiver preference would keep ALL call audio in the earpiece even
 * after switching to loudspeaker.
 */
function resetElementSink(el: HTMLMediaElement | null): void {
  if (!el) return;
  const sinkEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sinkEl.setSinkId !== "function") return;
  try {
    void sinkEl.setSinkId("").catch(() => {});
  } catch {
    // Best-effort.
  }
}

function destroyRelayGraph(): void {
  teardownRelayNodes();
  if (relayCtx) {
    void relayCtx.close();
    relayCtx = null;
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
  // NOTE: do NOT setSinkId(receiver) here. Field data (debug-1c0a94,
  // 20:54 UTC): applying it before the mic captures resolves successfully
  // but does not route, and WebKit then ignores identical re-applications.
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

function mountLegacyRelayOutput(
  stream: MediaStream,
  speakerOn: boolean,
): HTMLMediaElement {
  if (speakerOn) {
    teardownRelayNodes();
    // Drop any receiver preference set by the earpiece route BEFORE the
    // element goes away, so the session regains DefaultToSpeaker.
    resetElementSink(earpieceEl);
    destroyEarpieceElement();
    // Reuse the element unlocked during the user gesture — recreating it here
    // would lose the autoplay unlock and risk silent playback.
    const el = speakerEl ?? createSpeakerElement();
    el.srcObject = stream;
    resetElementSink(el);
    return el;
  }

  // Earpiece: direct raw stream on the <audio> element (reliable audio path)
  // plus a receiver sink preference. WebKit hard-codes DefaultToSpeaker into
  // the play-and-record session (AudioSessionIOS.mm) UNLESS the page selects
  // the receiver as preferred speaker via setSinkId — that flips the whole
  // session to voice-chat/receiver routing. The flip is session-wide, so it
  // works even though per-element sink routing is unreliable for WebRTC
  // tracks on iOS. If setSinkId is unavailable or fails, audio simply stays
  // on the loudspeaker — same as before, never silent.
  teardownRelayNodes();
  destroySpeakerElement();
  const el = earpieceEl ?? createEarpieceElement();
  el.srcObject = stream;
  startEarpieceSinkWatchers(el);
  scheduleEarpieceSinkRetries(el);
  return el;
}

/**
 * iOS earpiece sink orchestration.
 *
 * Field data (debug-1c0a94, iOS 18.7):
 * - setSinkId requires a live gesture/transient activation, BUT starting
 *   microphone capture also counts as activation for a few seconds.
 * - Applying setSinkId(receiver) BEFORE capture is live "succeeds" (promise
 *   resolves) yet does NOT route: the receiver port is not in the audio
 *   session yet. Worse, WebKit early-resolves any later setSinkId with the
 *   same id (deviceId == m_audioOutputHashedDeviceId check), so the broken
 *   state is sticky. Hence: never apply before capture, and always force a
 *   re-application by resetting to "" first.
 * - One phone never exposes the receiver in enumerateDevices at all —
 *   extended diagnostics below are for that case.
 */
let earpieceSinkApplied = false;
let earpieceSinkBusy = false;
let earpieceSinkGeneration = 0;
let watchedDeviceChange: (() => void) | null = null;
let watchedGesture: (() => void) | null = null;

function stopEarpieceSinkWatchers(): void {
  earpieceSinkGeneration += 1;
  if (watchedDeviceChange) {
    navigator.mediaDevices?.removeEventListener("devicechange", watchedDeviceChange);
    watchedDeviceChange = null;
  }
  if (watchedGesture) {
    document.removeEventListener("touchend", watchedGesture, true);
    document.removeEventListener("click", watchedGesture, true);
    watchedGesture = null;
  }
}

async function collectSinkDiagnostics(): Promise<Record<string, unknown>> {
  let outputs: Array<{ label: string; id: string }> = [];
  let inputs: string[] = [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    outputs = devices
      .filter((d) => d.kind === "audiooutput")
      .map((d) => ({ label: d.label ?? "", id: (d.deviceId ?? "").slice(0, 12) }));
    inputs = devices.filter((d) => d.kind === "audioinput").map((d) => d.label ?? "");
  } catch {
    // Logged with empty lists.
  }
  const session = (navigator as Navigator & { audioSession?: { type?: string; state?: string } })
    .audioSession;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  return {
    outputs,
    inputs,
    standalone,
    sessionType: session?.type ?? null,
    sessionState: session?.state ?? null,
    ua: navigator.userAgent.slice(40, 90),
  };
}

/**
 * Reset-then-set: WebKit early-resolves setSinkId with an id equal to the
 * element's current one without touching the session, so a plain retry after
 * an ineffective pre-capture application would be a silent no-op.
 */
async function forceApplySink(
  sinkEl: HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> },
  id: string,
): Promise<void> {
  try {
    await sinkEl.setSinkId!("");
  } catch {
    // Reset is best-effort; the real application below decides success.
  }
  await sinkEl.setSinkId!(id);
}

/**
 * Field data (debug-1c0a94, 21:35 vs 21:37 UTC): the receiver route engages
 * ONLY when setSinkId lands on a freshly created player whose audio renderer
 * has not started yet (first call: sink applied right after srcObject attach
 * — earpiece worked). Once the renderer is live, setSinkId resolves but
 * iOS 18 never re-routes it (later calls: applied:true, still loudspeaker).
 * So the working recipe is: recreate the player (detach/reattach srcObject),
 * THEN reset-and-set the sink on the not-yet-started renderer, then play.
 */
async function applyEarpieceSinkCycle(
  el: HTMLMediaElement,
  sinkEl: HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> },
  chosenId: string,
): Promise<void> {
  const stream = el.srcObject;
  if (stream) {
    el.srcObject = null;
    el.srcObject = stream;
  }
  await forceApplySink(sinkEl, chosenId);
  earpieceSinkApplied = true;

  // The remount pauses playback; silence is worse than a wrong route, so
  // retry until the element is audibly playing again.
  for (const delay of [0, 300, 800, 2000]) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (el !== earpieceEl || !el.isConnected) return;
    if (await playCallMedia(el)) return;
  }
  debugCallLog("earpiece_sink", { source: "post-cycle-play", playing: false });
}

async function tryApplyEarpieceSink(el: HTMLMediaElement, source: string): Promise<void> {
  if (earpieceSinkApplied || earpieceSinkBusy || el !== earpieceEl) return;
  const sinkEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sinkEl.setSinkId !== "function") {
    debugCallLog("earpiece_sink", { source, hasSetSinkId: false });
    return;
  }
  earpieceSinkBusy = true;
  let chosenId: string | undefined;
  let error = "";
  try {
    chosenId = await findIosAudioOutputId(false);
    if (el !== earpieceEl || earpieceSinkApplied) return;
    if (chosenId !== undefined) {
      await applyEarpieceSinkCycle(el, sinkEl, chosenId);
      stopEarpieceSinkWatchers();
      debugCallLog("earpiece_sink", { source, chosenId: chosenId.slice(0, 12), applied: true });
      return;
    }
    error = "no_receiver_candidate";
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    earpieceSinkBusy = false;
  }
  const diag = await collectSinkDiagnostics();
  debugCallLog("earpiece_sink", {
    source,
    chosenId: chosenId?.slice(0, 12) ?? null,
    applied: false,
    error,
    ...diag,
  });
}

/**
 * Retry right after the stream is mounted: capture-driven activation lasts a
 * few seconds after getUserMedia, and the receiver may appear in
 * enumerateDevices slightly later than the first mount.
 */
function scheduleEarpieceSinkRetries(el: HTMLMediaElement): void {
  const generation = earpieceSinkGeneration;
  const delays = [0, 700, 1800, 3500];
  for (const delay of delays) {
    setTimeout(() => {
      if (generation !== earpieceSinkGeneration || earpieceSinkApplied) return;
      void tryApplyEarpieceSink(el, `mount+${delay}`);
    }, delay);
  }
}

function startEarpieceSinkWatchers(el: HTMLMediaElement): void {
  if (earpieceSinkApplied) return;
  stopEarpieceSinkWatchers();

  // Receiver typically appears in enumerateDevices once the mic starts
  // capturing; WebKit fires devicechange at that moment and treats it as an
  // allowed trigger for speaker selection.
  if (navigator.mediaDevices?.addEventListener) {
    watchedDeviceChange = () => {
      debugCallLog("earpiece_sink", { source: "devicechange_fired" });
      void tryApplyEarpieceSink(el, "devicechange");
    };
    navigator.mediaDevices.addEventListener("devicechange", watchedDeviceChange);
  }

  // Any tap during the call is a fresh gesture — enumeration plus setSinkId
  // fit within the transient-activation window.
  watchedGesture = () => {
    if (el !== earpieceEl) {
      stopEarpieceSinkWatchers();
      return;
    }
    void tryApplyEarpieceSink(el, "gesture");
  };
  document.addEventListener("touchend", watchedGesture, true);
  document.addEventListener("click", watchedGesture, true);
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
    resetElementSink(earpieceEl);
    destroyEarpieceElement();
    const el = speakerEl ?? createSpeakerElement();
    el.srcObject = stream;
    resetElementSink(el);
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

  if (!stream) return null;
  return mountLegacyRelayOutput(stream, speakerOn);
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
