import {
  kickAudioSessionAfterCapture,
  prepareAudioSessionForCall,
  restoreAudioSessionAfterCall,
} from "@/lib/audio-session";
import { prepareCallAudioOutput, releaseCallAudioOutput, setCallProximityEnabled } from "@/lib/platform/call-audio";
import { ensureMediaPermissions } from "@/lib/platform/media-access";
import {
  CALL_CONNECT_POLL_INTERVAL_MS,
  CALL_DISCOVERY_POLL_INTERVAL_MS,
  CALL_HEARTBEAT_INTERVAL_MS,
  CALL_HEARTBEAT_ACTIVE_IOS_MS,
  CALL_POLL_INTERVAL_MS,
  DEFAULT_CALL_ICE_TIMEOUT_SEC,
  DEFAULT_CALL_MAX_SETUP_SEC,
  DEFAULT_CALL_RING_TIMEOUT_SEC,
} from "../constants";
import { normalizeKzPhone } from "../phone";
import { refreshIosAudioOutputEnumeration } from "@/lib/platform/call-audio-ios-web";
import { isIOSDevice } from "@/lib/platform/device";
import { getCallSounds } from "./call-sounds";
import { watchCallAudioInterruptions } from "./call-audio-interruption";
import {
  activateCallMediaSession,
  releaseCallMediaSession,
} from "./call-media-session";
import { primeCallMediaPlayback, resetCallMediaForNewCall } from "./call-media-playback";
import {
  CallPeerConnection,
  purgeOrphanedCallMediaElements,
  releaseCallMediaPlayback,
  type IceCandidatePayload,
} from "./peer-connection";
import {
  endCallApi,
  fetchIceServers,
  heartbeatCall,
  initiateCall,
  pollActiveCall,
  pollCallSignals,
  prefetchIceServers,
  sendCallSignal,
  sendCallSignalDetailed,
} from "./signaling-client";
import { getMessengerRealtimeClient } from "../realtime/client";
import { CallJournal } from "./call-journal";
import { checkCallInvariants } from "./call-invariants";
import { isCallObservabilityEnabled } from "./call-observability";
import type { CallDebugInfo, CallEndReason, CallPhase, CallState, TransportPhase } from "./types";
import type { CallPollResponse } from "./types";

type Listener = (state: CallState) => void;
type MediaListener = (media: { localStream: MediaStream | null; remoteStream: MediaStream | null }) => void;

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function hasVideoInSdp(payload: string | null | undefined): boolean {
  if (!payload) return false;
  return /m=video\s+\d+/i.test(payload);
}

function defaultSpeakerForMode(mode: "audio" | "video"): boolean {
  // Video calls should default to loudspeaker (WhatsApp-like UX on mobile).
  return mode === "video";
}

function mediaAccessErrorMessage(err: unknown): string {
  const text = describeError(err).toLowerCase();
  if (text.includes("permission") || text.includes("notallowed") || text.includes("denied")) {
    return "Разрешите доступ к микрофону и камере в настройках браузера или приложения.";
  }
  return "Не удалось получить доступ к микрофону";
}

/** Race a promise against a hard deadline so a stuck browser API (e.g. a
 * getUserMedia permission prompt that never gets answered) can't freeze the
 * whole call setup chain forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const INITIAL_DEBUG: CallDebugInfo = {
  isCaller: false,
  turnSource: null,
  iceConnectionState: null,
  connectionState: null,
  hasRemoteDescription: false,
  hasLocalOffer: false,
  hasLocalAnswer: false,
  hasSessionOffer: false,
  hasSessionAnswer: false,
  lastError: null,
  pollCount: 0,
  elapsedSec: 0,
  sdpSendAttempts: 0,
  lastSdpSendStatus: null,
  lastPollStatus: null,
  activeCallId: null,
  mediaTag: null,
  mediaPaused: true,
  remoteTrackMuted: true,
  hasRemoteTrack: false,
  hasRemoteVideoTrack: false,
  hasLocalVideoTrack: false,
  receiverCount: 0,
  speakerOn: false,
  mediaRoute: "default",
  audioSessionState: null,
  networkPath: null,
  networkProtocol: null,
};

const INITIAL_STATE: CallState = {
  phase: "idle",
  callId: null,
  channel: null,
  peerPhone: null,
  callMode: "audio",
  muted: false,
  videoEnabled: false,
  speakerOn: false,
  durationSec: 0,
  errorMessage: null,
  endReason: null,
  debug: { ...INITIAL_DEBUG },
};

export class CallController {
  private state: CallState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();
  private mediaListeners = new Set<MediaListener>();
  private myPhone = "";
  private peerPhone = "";
  private channel = "";
  private isCaller = false;
  private pc: CallPeerConnection | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activePollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private iceTimeout: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private sinceSeq = 0;
  private localStream: MediaStream | null = null;
  private lastSession: CallPollResponse["session"] | null = null;
  private sdpSyncInFlight = false;
  private sdpSyncStartedAt = 0;
  private sdpApplyInFlight = false;
  private localOfferSdp: string | null = null;
  private localAnswerSdp: string | null = null;
  private lastSdpResendAt = 0;
  private resendInFlight = false;
  private sdpKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private callStartedAt = 0;
  private pollInFlight = false;
  private pollStartedAt = 0;
  private pendingRemoteIce: string[] = [];
  private destroyed = false;
  private pollCallId: string | null = null;
  private realtimeUnsub: (() => void) | null = null;
  private realtimeModeUnsub: (() => void) | null = null;
  private applyPollDataInFlight = false;
  private pendingPollMerge: CallPollResponse | null = null;
  private cleanupInFlight = false;
  private endedOnServer = new Set<string>();
  private pendingRemoteAnswer: string | null = null;
  private localMediaPromise: Promise<void> | null = null;
  /** Bumped on cleanup/reset — invalidates in-flight getUserMedia requests. */
  private mediaEpoch = 0;
  private catchUpPollTimers: ReturnType<typeof setTimeout>[] = [];
  private iceOutBatch: IceCandidatePayload[] = [];
  private iceOutTimer: ReturnType<typeof setTimeout> | null = null;
  private setupWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private interruptionUnsub: (() => void) | null = null;
  private networkDebugTimer: ReturnType<typeof setInterval> | null = null;
  private videoHealthTimer: ReturnType<typeof setInterval> | null = null;
  private videoRecoveryInFlight = false;
  private transportPhase: TransportPhase = "new";
  private sessionId = "s-init";
  private journal = new CallJournal(() => ({
    elapsedMs: this.callStartedAt > 0 ? Date.now() - this.callStartedAt : 0,
    callId: this.state.callId,
    sessionId: this.sessionId,
    peer: this.peerPhone || this.state.peerPhone || null,
  }));

  configure(params: { myPhone: string; peerPhone: string; channel: string }): void {
    this.myPhone = params.myPhone;
    this.peerPhone = params.peerPhone;
    this.channel = params.channel;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  subscribeMedia(listener: MediaListener): () => void {
    this.mediaListeners.add(listener);
    listener({ localStream: this.localStream, remoteStream: this.pc?.getRemoteStream() ?? null });
    return () => this.mediaListeners.delete(listener);
  }

  getState(): CallState {
    return this.state;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.pc?.getRemoteStream() ?? null;
  }

  exportCallJournal(): string {
    return this.journal.exportText();
  }

  isInCall(): boolean {
    return this.state.phase !== "idle" && this.state.phase !== "ended";
  }

  private emitMedia(): void {
    const payload = {
      localStream: this.localStream,
      remoteStream: this.pc?.getRemoteStream() ?? null,
    };
    for (const listener of this.mediaListeners) listener(payload);
  }

  private nextSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `s-${crypto.randomUUID().slice(0, 8)}`;
    }
    return `s-${Math.random().toString(36).slice(2, 10)}`;
  }

  private setTransportPhase(next: TransportPhase): void {
    this.transportPhase = next;
  }

  private recordIgnored(event: string, meta?: Record<string, string | number | boolean | null>): void {
    this.journal.record("IGNORED_EVENT", event, {
      phase: this.state.phase,
      ...meta,
    });
  }

  private checkInvariantsOnTransition(): void {
    if (!isCallObservabilityEnabled()) return;
    const violations = checkCallInvariants({
      phase: this.state.phase,
      callId: this.state.callId,
      hasPeerConnection: Boolean(this.pc),
      hasLocalStream: Boolean(this.localStream),
      hasRemoteTrack: Boolean(this.state.debug.hasRemoteTrack),
      hasPolling: Boolean(this.pollTimer),
      transportPhase: this.transportPhase,
    });
    for (const violation of violations) {
      this.journal.record("INVARIANT_VIOLATION", violation, { tzGap: true });
      console.warn("[call-invariant]", violation);
    }
  }

  startIncomingWatch(): void {
    this.stopIncomingWatch();
    if (!this.channel) return;

    const tick = async () => {
      if (this.isInCall() || this.destroyed) return;
      const data = await pollActiveCall(this.channel);
      if (!data.active || !data.session || !data.incoming) return;
      if (this.state.phase !== "idle") return;
      this.isCaller = false;
      this.sinceSeq = 0;
      this.lastSession = data.session;
      this.callStartedAt = Date.now();
      this.patch({
        debug: { ...INITIAL_DEBUG },
        phase: "incoming",
        callId: data.session.callId,
        channel: this.channel,
        peerPhone: this.peerPhone,
        callMode: data.session.media === "video" ? "video" : "audio",
        videoEnabled: data.session.media === "video",
        speakerOn: defaultSpeakerForMode(data.session.media === "video" ? "video" : "audio"),
        endReason: null,
        errorMessage: null,
      });
      this.applySessionSnapshot(data.session);
      this.adoptCallId(data.session.callId);
      this.startRingTimeout();
      this.startSetupWatchdog();
      this.startElapsedTimer();
      this.startSdpKeepalive();
    };

    void tick();
    this.activePollTimer = setInterval(() => void tick(), CALL_DISCOVERY_POLL_INTERVAL_MS);
  }

  stopIncomingWatch(): void {
    if (this.activePollTimer) {
      clearInterval(this.activePollTimer);
      this.activePollTimer = null;
    }
  }

  async startOutgoing(options?: { video?: boolean }): Promise<void> {
    if (this.isInCall()) {
      this.recordIgnored("INITIATE");
      return;
    }
    const callMode: "audio" | "video" = options?.video === true ? "video" : "audio";
    const speakerOn = defaultSpeakerForMode(callMode);
    const videoEnabled = callMode === "video";

    this.isCaller = true;
    this.sinceSeq = 0;
    this.lastSession = null;
    this.localOfferSdp = null;
    this.localAnswerSdp = null;
    this.pendingRemoteAnswer = null;
    this.callStartedAt = Date.now();
    this.patch({
      debug: { ...INITIAL_DEBUG, isCaller: true },
      phase: "outgoing",
      callId: null,
      channel: this.channel,
      peerPhone: this.peerPhone,
      callMode,
      videoEnabled,
      speakerOn,
      endReason: null,
      errorMessage: null,
    });
    void activateCallMediaSession(this.peerPhone || this.state.peerPhone || "QHub", {
      speakerOn,
      videoEnabled,
    });
    this.startVideoHealthWatch();
    this.startElapsedTimer();
    this.journal.record("INITIATE", "outgoing");
    prefetchIceServers();

    const mediaTask = (this.localMediaPromise ??
      this.acquireLocalMedia({ video: callMode === "video", speakerOn })).finally(() => {
      this.localMediaPromise = null;
    });

    // Build the RTCPeerConnection and local offer in parallel with
    // /call/initiate — the offer itself doesn't depend on callId, only
    // sending it does. Early ICE candidates queue up (flushLocalIce holds
    // them until callId arrives). Saves an initiate round-trip + PC init
    // from the connect timeline.
    const epoch = this.mediaEpoch;
    const offerTask = (async () => {
      await mediaTask;
      try {
        await this.setupPeerConnection();
        // Cleanup may have run while we were setting up (initiate failed or
        // the user hung up) — close the freshly built PC instead of leaking it.
        if (epoch !== this.mediaEpoch) {
          this.pc?.close();
          this.pc = null;
          throw new Error("call_ended_during: peer_setup");
        }
        const offerSdp = await this.pc!.createOffer({
          receiveVideo: callMode === "video",
        });
        this.localOfferSdp = offerSdp;
        this.patchDebug({ hasLocalOffer: true });
        return offerSdp;
      } catch (err) {
        const text = describeError(err);
        if (text.includes("call_ended_during")) throw err;
        throw new Error(`peer_setup: ${text}`);
      }
    })();

    const initiatePromise = initiateCall({
      channel: this.channel,
      peerPhone: this.peerPhone,
      media: callMode,
    });

    let initiate: Awaited<ReturnType<typeof initiateCall>>;
    let offerSdp: string;
    try {
      const [offerResult, initiateResult] = await Promise.all([
        offerTask,
        initiatePromise,
      ]);
      offerSdp = offerResult;
      initiate = initiateResult;
    } catch (err) {
      // The local half failed but /call/initiate may still succeed — end that
      // call on the server so the callee's phone stops ringing.
      void initiatePromise
        .then((r) => {
          if (r.ok && r.callId) void endCallApi(r.callId, "error");
        })
        .catch(() => {});
      const text = describeError(err);
      // User hung up (or cleanup ran) while capture was pending — the hangup
      // path already cleaned up; showing an error on top would be wrong.
      if (text.includes("call_ended_during")) return;
      this.patchDebug({ lastError: text });
      const msg = text.startsWith("peer_setup")
        ? "Не удалось установить соединение"
        : mediaAccessErrorMessage(err);
      await this.cleanup("error", msg);
      return;
    }

    if (!initiate.ok && initiate.error === "busy" && initiate.callId) {
      await endCallApi(initiate.callId, "supersede");
      initiate = await initiateCall({
        channel: this.channel,
        peerPhone: this.peerPhone,
        media: callMode,
      });
    }

    if (!initiate.ok || !initiate.callId) {
      const msg =
        initiate.error === "busy"
          ? "Собеседник занят"
          : "Не удалось начать звонок";
      // cleanup (not a manual stop) — the peer connection already exists here
      // and must be closed, and mediaEpoch must invalidate late captures.
      await this.cleanup("busy", msg);
      return;
    }

    this.patch({
      callId: initiate.callId,
      debug: { ...this.state.debug, activeCallId: initiate.callId },
    });

    this.adoptCallId(initiate.callId);
    this.startRingTimeout();
    this.startSetupWatchdog();
    this.startSdpKeepalive();

    this.setTransportPhase("offer_sent");
    this.journal.record("OFFER_SENT");
    void this.sendSignalReliable({
      callId: initiate.callId,
      type: "offer",
      payload: offerSdp,
    });
    // Release ICE candidates gathered while callId was still unknown.
    void this.flushLocalIce();
  }

  /**
   * Start mic/camera capture during the user-gesture turn (before any await in
   * startOutgoing/acceptIncoming). Call synchronously from click handlers.
   */
  beginLocalMediaCapture(options: { video?: boolean; speakerOn?: boolean }): Promise<void> {
    if (this.localMediaPromise) return this.localMediaPromise;
    const video = options.video === true;
    const callMode: "audio" | "video" = video ? "video" : "audio";
    const speakerOn = options.speakerOn ?? defaultSpeakerForMode(callMode);
    this.patch({
      callMode,
      videoEnabled: video,
      speakerOn,
    });
    prepareAudioSessionForCall();
    prefetchIceServers();
    this.localMediaPromise = this.acquireLocalMedia({ video, speakerOn });
    return this.localMediaPromise;
  }

  async acceptIncoming(): Promise<void> {
    if (this.state.phase !== "incoming" || !this.state.callId) {
      this.recordIgnored("ACCEPT");
      return;
    }

    this.clearRingTimeout();
    this.localAnswerSdp = null;
    this.patch({ phase: "connecting" });
    prefetchIceServers();

    // Tell the server right away that the call was accepted, before the slow
    // part (getUserMedia + ICE config + createAnswer). The caller's poll/WS
    // picks up status="connecting" within ~150ms, so their UI leaves
    // "Звоним…" immediately instead of after the full answer round-trip.
    void this.sendSignalReliable({ callId: this.state.callId, type: "accept" });

    try {
      const mediaTask = (this.localMediaPromise ??
        this.acquireLocalMedia({
          video: this.state.callMode === "video",
          speakerOn: defaultSpeakerForMode(this.state.callMode),
        })).finally(() => {
        this.localMediaPromise = null;
      });

      // Reconcile with the server's active call for this DM channel in
      // parallel with media capture — both used to run back-to-back and
      // added seconds before the answer was even created.
      const [, serverSession] = await Promise.all([
        mediaTask,
        this.refreshCallFromServer(),
      ]);
      const offerHasVideo = hasVideoInSdp(serverSession?.offerSdp);
      const mode: "audio" | "video" =
        serverSession?.media === "video" || offerHasVideo ? "video" : "audio";
      const speakerOn = defaultSpeakerForMode(mode);
      if (mode === "video") {
        primeCallMediaPlayback(true);
      }
      this.patch({
        callMode: mode,
        videoEnabled: mode === "video" ? this.state.videoEnabled || offerHasVideo : false,
        speakerOn,
      });
      void activateCallMediaSession(this.peerPhone || this.state.peerPhone || "QHub", {
        speakerOn,
        videoEnabled: mode === "video" && (this.state.videoEnabled || offerHasVideo),
      });
      this.startVideoHealthWatch();

      await this.setupPeerConnection();
      await this.ensureSdpApplied();

      if (!this.pc?.hasRemoteDescription()) {
        void this.pollNow();
      }
    } catch (err) {
      const text = describeError(err);
      if (text.includes("call_ended_during")) return;
      this.patchDebug({ lastError: text });
      if (this.state.callId) {
        await sendCallSignal({ callId: this.state.callId, type: "reject" });
      }
      await this.cleanup("error", mediaAccessErrorMessage(err));
    }
  }

  async rejectIncoming(): Promise<void> {
    if (!this.state.callId) {
      this.recordIgnored("DECLINE");
      return;
    }
    const callId = this.state.callId;
    this.journal.record("DECLINE", "local");
    await this.sendSignalReliable({ callId, type: "reject" });
    await this.endCallReliable(callId, "reject");
    await this.cleanup("reject");
  }

  async hangup(): Promise<void> {
    if (!this.state.callId) {
      this.recordIgnored("HANGUP");
      // Cancel while dialing, before /call/initiate returned: the mic (and
      // possibly the PC) is already live — a bare reset() left the capture
      // running, which iOS shows as a stuck mic/camera indicator.
      await this.cleanup("hangup", undefined, { skipServerEnd: true });
      this.reset();
      return;
    }
    const callId = this.state.callId;
    this.journal.record("HANGUP", "local");
    await this.flushLocalIce();
    // endCallReliable (POST /call/end) already appends the "end" signal AND
    // sets endReason to the specific reason ("hangup"). Sending a separate
    // "end" signal first used to hardcode endReason to the generic "end",
    // so the remote peer lost the friendly "Собеседник завершил звонок"
    // message — endCallReliable alone covers both.
    await this.endCallReliable(callId, "hangup");
    this.endedOnServer.add(callId);
    await this.cleanup("hangup", undefined, { skipServerEnd: true });
  }

  setMuted(muted: boolean): void {
    this.pc?.setMuted(muted);
    this.patch({ muted });
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (this.state.callMode !== "video") return;
    this.patch({ videoEnabled: enabled });
    if (!this.localStream) return;
    const localVideoTracks = this.localStream.getVideoTracks();
    const hasLiveLocalVideo = localVideoTracks.some((track) => track.readyState === "live");
    if (!enabled) {
      // Keep sender/transceiver alive and just pause camera track.
      // This avoids renegotiation races and improves toggle reliability.
      for (const track of localVideoTracks) {
        track.enabled = false;
      }
      this.pc?.setVideoEnabled(false);
      this.stopVideoHealthWatch();
      this.patchPlaybackDebug();
      this.emitMedia();
      return;
    }
    if (enabled && !hasLiveLocalVideo) {
      for (const track of localVideoTracks) {
        if (track.readyState !== "live") {
          this.localStream.removeTrack(track);
        }
      }
      try {
        const videoOnly = await this.captureUserMedia(
          { audio: false, video: { width: 640, height: 360, frameRate: 15 } },
          12000,
          "get_user_media_video",
        );
        const videoTrack = videoOnly.getVideoTracks()[0];
        if (videoTrack) {
          this.localStream.addTrack(videoTrack);
          await this.pc?.attachLocalStream(this.localStream);
        }
      } catch {
        this.patch({ videoEnabled: false });
      }
    } else {
      for (const track of localVideoTracks) {
        if (track.readyState === "live") {
          track.enabled = true;
        }
      }
    }
    this.pc?.setVideoEnabled(enabled);
    if (
      this.state.phase === "outgoing" ||
      this.state.phase === "connecting" ||
      this.state.phase === "active"
    ) {
      void activateCallMediaSession(this.peerPhone || this.state.peerPhone || "QHub", {
        speakerOn: this.state.speakerOn,
        videoEnabled: enabled,
      });
    }
    this.startVideoHealthWatch();
    this.patchPlaybackDebug();
    this.emitMedia();
  }

  setSpeaker(speakerOn: boolean): void {
    prepareAudioSessionForCall();
    this.pc?.setSpeakerphone(speakerOn);
    this.patch({ speakerOn });
    void setCallProximityEnabled(this.state.callMode === "audio" && !speakerOn);
    if (this.state.phase === "active") {
      void activateCallMediaSession(this.peerPhone || this.state.peerPhone || "QHub", {
        speakerOn,
        videoEnabled: this.state.videoEnabled,
      });
    }
    void this.pc?.playRemoteAudio().then(() => this.patchPlaybackDebug());
  }

  async handleDeepLink(
    callId: string,
    opts?: { channel?: string; peerPhone?: string; media?: "audio" | "video" },
  ): Promise<void> {
    if (this.isInCall()) {
      this.recordIgnored("DEEP_LINK_INITIATE");
      return;
    }
    if (opts?.channel) this.channel = opts.channel;
    if (opts?.peerPhone) this.peerPhone = opts.peerPhone;
    this.isCaller = false;
    this.sinceSeq = 0;
    this.lastSession = null;
    this.callStartedAt = Date.now();
    this.patch({
      debug: { ...INITIAL_DEBUG, activeCallId: callId },
      phase: "incoming",
      callId,
      channel: this.channel,
      peerPhone: this.peerPhone,
      callMode: opts?.media === "video" ? "video" : "audio",
      videoEnabled: opts?.media === "video",
      speakerOn: defaultSpeakerForMode(opts?.media === "video" ? "video" : "audio"),
      endReason: null,
      errorMessage: null,
    });
    this.startVideoHealthWatch();
    this.journal.record("INITIATE", "deep_link");
    this.adoptCallId(callId);
    this.startRingTimeout();
    this.startSetupWatchdog();
    this.startElapsedTimer();
    this.startSdpKeepalive();

    const serverSession = await this.refreshCallFromServer();
    const mode: "audio" | "video" =
      serverSession?.media === "video" || hasVideoInSdp(serverSession?.offerSdp) ? "video" : "audio";
    this.patch({
      callMode: mode,
      videoEnabled: mode === "video",
      speakerOn: defaultSpeakerForMode(mode),
    });
    this.startVideoHealthWatch();
  }

  destroy(): void {
    this.destroyed = true;
    void this.cleanup(null);
    this.stopIncomingWatch();
  }

  private patchDebug(partial: Partial<CallDebugInfo>): void {
    this.patch({ debug: { ...this.state.debug, ...partial } });
  }

  private patch(partial: Partial<CallState>): void {
    const prevPhase = this.state.phase;
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);

    if (prevPhase !== this.state.phase) {
      this.journal.record("CALL_STATE", `${prevPhase} → ${this.state.phase}`);
      this.checkInvariantsOnTransition();
      this.updateSoundsForPhase(this.state.phase);
      if (this.state.phase === "connecting" || this.state.phase === "active") {
        this.clearRingTimeout();
      }
    }

    const phase = this.state.phase;
    if (
      prevPhase !== phase &&
      this.pollCallId &&
      (phase === "connecting" || phase === "outgoing" || phase === "incoming")
    ) {
      this.restartPollingInterval();
    }
  }

  private restartPollingInterval(): void {
    if (!this.pollCallId) return;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    // Keep aggressive poll during call setup — WS is additive, not a replacement.
    // Slowing to 10s caused up to ~19s phase desync when a WS answer was missed.
    this.pollTimer = setInterval(() => void this.pollOnce(), this.pollIntervalMs());
  }

  private mergePollResponses(
    current: CallPollResponse | null,
    incoming: CallPollResponse,
  ): CallPollResponse {
    if (!current) return incoming;
    const signalsBySeq = new Map<number, CallPollResponse["signals"][number]>();
    for (const signal of current.signals) signalsBySeq.set(signal.seq, signal);
    for (const signal of incoming.signals) signalsBySeq.set(signal.seq, signal);
    const signals = [...signalsBySeq.values()].sort((a, b) => a.seq - b.seq);
    const session =
      incoming.session.version >= current.session.version
        ? incoming.session
        : current.session;
    return { signals, session };
  }

  private async applyPollDataSafe(data: CallPollResponse): Promise<void> {
    if (this.applyPollDataInFlight) {
      this.pendingPollMerge = this.mergePollResponses(this.pendingPollMerge, data);
      return;
    }
    this.applyPollDataInFlight = true;
    try {
      await withTimeout(this.applyPollData(data), 5000, "apply_poll_data");
    } catch (err) {
      console.error("[call] applyPollData failed:", err);
      this.patchDebug({ lastError: describeError(err) });
    } finally {
      this.applyPollDataInFlight = false;
      if (this.pendingPollMerge) {
        const pending = this.pendingPollMerge;
        this.pendingPollMerge = null;
        void this.applyPollDataSafe(pending);
      }
    }
  }

  private async applyPollData(data: CallPollResponse): Promise<void> {
    for (const signal of data.signals) {
      this.sinceSeq = Math.max(this.sinceSeq, signal.seq);
      await this.handleSignal(signal.type, signal.from, signal.payload);
    }

    void this.pc?.flushPendingRemoteCandidates();
    this.lastSession = data.session;
    this.patchDebug({
      pollCount: this.state.debug.pollCount + 1,
      hasSessionOffer: Boolean(data.session.offerSdp),
      hasSessionAnswer: Boolean(data.session.answerSdp),
      elapsedSec: Math.floor((Date.now() - this.callStartedAt) / 1000),
    });

    if (data.session.status === "ended" && this.state.phase !== "ended") {
      this.syncFromSession(data.session);
      return;
    }

    this.syncProgressFromSession(data.session);
    this.syncSdpFromSession(data.session);
  }

  private applySessionSnapshot(session: CallPollResponse["session"]): void {
    this.lastSession = session;
    this.patchDebug({
      activeCallId: session.callId,
      hasSessionOffer: Boolean(session.offerSdp),
      hasSessionAnswer: Boolean(session.answerSdp),
    });
  }

  /** Switch poll/heartbeat to a different callId (resets signal cursor). */
  private adoptCallId(callId: string): void {
    if (this.pollCallId === callId && this.state.callId === callId) return;
    this.sinceSeq = 0;
    this.patch({ callId });
    this.patchDebug({ activeCallId: callId });
    this.startPolling(callId);
    this.startHeartbeat(callId);
  }

  /**
   * Reconcile local callId with the server's active call on this DM channel.
   * Fixes callee polling a stale deep-link callId while the real offer lives
   * on a newer session.
   */
  private async refreshCallFromServer(): Promise<CallPollResponse["session"] | null> {
    if (this.channel) {
      const active = await pollActiveCall(this.channel);
      if (active.active && active.session) {
        this.applySessionSnapshot(active.session);
        if (active.session.callId !== this.state.callId) {
          this.adoptCallId(active.session.callId);
        }
        return active.session;
      }
    }

    const callId = this.state.callId ?? this.pollCallId;
    if (!callId) return null;

    const result = await pollCallSignals(callId, 0);
    this.patchDebug({ lastPollStatus: result.status });
    if (result.data?.session) {
      this.applySessionSnapshot(result.data.session);
      return result.data.session;
    }
    return null;
  }

  /**
   * getUserMedia wrapper that guarantees the captured tracks get stopped when
   * the call ends (cleanup bumps mediaEpoch) or the deadline fires before the
   * promise resolves. A bare withTimeout(getUserMedia) leaks the capture: the
   * browser resolves it later with live tracks nobody stops — on iOS that kept
   * the mic/camera indicator in the Dynamic Island after the call ended.
   */
  private async captureUserMedia(
    constraints: MediaStreamConstraints,
    ms: number,
    label: string,
  ): Promise<MediaStream> {
    const epoch = this.mediaEpoch;
    let adopted = false;
    const request = navigator.mediaDevices.getUserMedia(constraints);
    void request
      .then((stream) => {
        if (!adopted) {
          for (const t of stream.getTracks()) t.stop();
        }
      })
      .catch(() => {});
    const stream = await withTimeout(request, ms, label);
    if (epoch !== this.mediaEpoch) {
      throw new Error(`call_ended_during: ${label}`);
    }
    adopted = true;
    return stream;
  }

  private async acquireLocalMedia(options: {
    video: boolean;
    speakerOn: boolean;
  }): Promise<void> {
    prepareAudioSessionForCall();
    // A re-acquire (e.g. ensureLocalMedia on the answer path) must not orphan
    // a previous capture — its live tracks would keep the mic busy on iOS.
    const previousStream = this.localStream;
    const needVideo = options.video;
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const videoConstraints = needVideo
      ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          frameRate: { ideal: 15, max: 24 },
        }
      : false;

    // getUserMedia must be the first await after the user gesture on iOS.
    try {
      this.localStream = await this.captureUserMedia(
        { audio: audioConstraints, video: videoConstraints },
        15000,
        "get_user_media",
      );
    } catch (firstErr) {
      await withTimeout(
        ensureMediaPermissions({ audio: true, video: needVideo }),
        15000,
        "media_permissions",
      );
      try {
        this.localStream = await this.captureUserMedia(
          { audio: audioConstraints, video: videoConstraints },
          15000,
          "get_user_media_retry",
        );
      } catch {
        if (!needVideo) throw firstErr;
        this.localStream = await this.captureUserMedia(
          { audio: audioConstraints, video: false },
          15000,
          "get_user_media_audio_only",
        );
        this.patch({ videoEnabled: false, callMode: "audio" });
      }
    }

    if (previousStream && previousStream !== this.localStream) {
      for (const t of previousStream.getTracks()) t.stop();
    }

    await prepareCallAudioOutput({ speakerOn: options.speakerOn });
    kickAudioSessionAfterCapture();
    void refreshIosAudioOutputEnumeration();
    this.patchPlaybackDebug();
    this.emitMedia();
  }

  private async ensureLocalMedia(): Promise<void> {
    const needVideo = this.state.callMode === "video" && this.state.videoEnabled;
    await this.acquireLocalMedia({ video: needVideo, speakerOn: this.state.speakerOn });
  }

  private async setupPeerConnection(): Promise<void> {
    this.sessionId = this.nextSessionId();
    this.setTransportPhase("new");
    this.journal.record("CREATE_PC");
    const { iceServers, turnSource } = await fetchIceServers();
    this.patchDebug({ turnSource, isCaller: this.isCaller });
    this.pc = new CallPeerConnection();
    this.pc.setCallMode(this.state.callMode);
    await this.pc.init(iceServers);
    if (isIOSDevice()) {
      this.startCallAudioWatch();
    }
    if (this.localStream) {
      await this.pc.attachLocalStream(this.localStream);
    }
    this.pc.setSpeakerphone(this.state.speakerOn);
    this.pc.setHandlers({
      onIceCandidate: (candidate) => {
        if (!candidate.candidate) {
          void this.flushLocalIce();
          return;
        }
        // Candidates may arrive before /call/initiate returns a callId —
        // queue them; flushLocalIce keeps the batch until the id exists.
        this.queueLocalIce(candidate);
      },
      onConnectionState: (connState) => {
        this.patchDebug({ connectionState: connState });
        void this.refreshNetworkPathDebug();
        this.handlePeerConnected(connState === "connected");
        if (connState === "failed") {
          void this.cleanup(
            "error",
            "Не удалось установить соединение. Попробуйте Wi‑Fi или перезвоните.",
          );
        }
      },
      onIceConnectionState: (iceState) => {
        this.patchDebug({ iceConnectionState: iceState });
        void this.refreshNetworkPathDebug();
        if (iceState === "checking") {
          this.setTransportPhase("ice_connecting");
          this.journal.record("ICE_CONNECTING");
        } else if (iceState === "connected" || iceState === "completed") {
          this.setTransportPhase("ice_connected");
          this.journal.record("ICE_CONNECTED");
        } else if (iceState === "disconnected") {
          this.setTransportPhase("ice_disconnected");
          this.journal.record("ICE_DISCONNECTED");
        } else if (iceState === "failed") {
          this.setTransportPhase("ice_failed");
          this.journal.record("ICE_FAILED");
        }
        if (iceState === "failed") {
          void this.cleanup(
            "error",
            "Не удалось установить соединение. Попробуйте Wi‑Fi или перезвоните.",
          );
          return;
        }
        this.handlePeerConnected(iceState === "connected" || iceState === "completed");
      },
      onRemoteTrack: () => {
        this.journal.record("TRACK_REMOTE");
        void this.pc?.playRemoteAudio();
        this.patchPlaybackDebug();
        this.emitMedia();
        this.handlePeerConnected(true);
      },
    });
    this.patchPlaybackDebug();
    this.emitMedia();

    const pendingAnswer = this.pendingRemoteAnswer ?? this.lastSession?.answerSdp ?? null;
    if (this.isCaller && pendingAnswer && this.pc && !this.pc.hasRemoteDescription()) {
      void this.applyRemoteAnswer(pendingAnswer);
    }
  }

  private async sendSignalReliable(params: {
    callId: string;
    type: "offer" | "answer" | "ice" | "accept" | "reject" | "end" | "busy";
    payload?: string;
  }): Promise<void> {
    const trackSdp = params.type === "offer" || params.type === "answer";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (trackSdp) {
        const result = await sendCallSignalDetailed(params);
        this.patchDebug({
          sdpSendAttempts: this.state.debug.sdpSendAttempts + 1,
          lastSdpSendStatus: result.status,
        });
        if (result.ok) {
          if (result.session) {
            this.lastSession = result.session;
            this.patchDebug({
              hasSessionOffer: Boolean(result.session.offerSdp),
              hasSessionAnswer: Boolean(result.session.answerSdp),
            });
          }
          return;
        }
      } else if (await sendCallSignal(params)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  private async ensureSdpApplied(session?: CallPollResponse["session"] | null): Promise<void> {
    const snap = session ?? this.lastSession;
    if (!snap || !this.pc) return;

    if (!this.isCaller && snap.offerSdp && !this.pc.hasRemoteDescription()) {
      await this.applyRemoteOffer(snap.offerSdp);
      return;
    }
    if (this.isCaller && snap.answerSdp && !this.pc.hasRemoteDescription()) {
      await this.applyRemoteAnswer(snap.answerSdp);
    }
  }

  private async applyRemoteAnswer(payload: string): Promise<void> {
    if (this.pc?.hasRemoteDescription() || this.sdpApplyInFlight) return;
    if (!this.pc) {
      this.pendingRemoteAnswer = payload;
      this.clearRingTimeout();
      getCallSounds().stop();
      if (this.state.phase === "outgoing") {
        this.patch({ phase: "connecting" });
      }
      return;
    }
    this.pendingRemoteAnswer = null;
    this.sdpApplyInFlight = true;
    try {
      this.isCaller = true;
      this.clearRingTimeout();
      getCallSounds().stop();
      if (this.state.phase === "outgoing") {
        this.patch({ phase: "connecting" });
      }
      await this.pc.applyAnswer(payload);
      this.setTransportPhase("answer_received");
      this.journal.record("ANSWER_RECEIVED");
      this.patchDebug({ hasRemoteDescription: true });
      await this.flushPendingRemoteIce();
      if (this.state.phase !== "active") {
        this.patch({ phase: "connecting" });
      }
      this.startIceTimeout();
      void this.pc.playRemoteAudio().then(() => {
        this.patchPlaybackDebug();
        if (this.pc?.getPlaybackDebug()?.hasRemoteTrack) {
          this.handlePeerConnected(true);
        }
      });
    } finally {
      this.sdpApplyInFlight = false;
    }
  }

  private async applyRemoteOffer(offerPayload: string): Promise<void> {
    if (this.pc?.hasRemoteDescription() || this.sdpApplyInFlight) return;
    this.sdpApplyInFlight = true;
    try {
      if (hasVideoInSdp(offerPayload) && this.state.callMode !== "video") {
        this.patch({ callMode: "video", videoEnabled: true });
      }
      if (!this.pc) {
        await this.ensureLocalMedia();
        await this.setupPeerConnection();
      }
      const answerSdp = await this.pc!.createAnswer(offerPayload);
      this.localAnswerSdp = answerSdp;
      this.patchDebug({ hasRemoteDescription: true, hasLocalAnswer: true });
      await this.flushPendingRemoteIce();
      await this.pc?.flushPendingRemoteCandidates();
      if (this.state.phase !== "active") {
        this.patch({ phase: "connecting" });
      }
      this.startIceTimeout();
      void this.pc?.playRemoteAudio();

      if (this.state.callId) {
        void this.sendSignalReliable({
          callId: this.state.callId,
          type: "answer",
          payload: answerSdp,
        });
      }
    } finally {
      this.sdpApplyInFlight = false;
    }
  }

  /**
   * Level-triggered SDP sync: applies the latest known offer/answer straight
   * from the call session, independent of whether the discrete "offer"/"answer"
   * signal was individually observed in this poll. This makes the handshake
   * self-healing against dropped signals (rate limits, backgrounded tabs, etc.):
   * every poll tick converges toward the correct state.
   *
   * Guarded against: (a) overlapping invocations racing on the same tick cycle
   * (sdpSyncInFlight), and (b) a thrown error leaving the call silently stuck
   * forever — any failure here ends the call with a visible message instead of
   * retrying the same broken SDP on every subsequent tick.
   */
  /**
   * The initial offer/answer POST only retries a few times over ~450ms before
   * giving up silently. If it never lands (transient mobile network blip),
   * nothing would ever resend it, and the peer stays stuck forever waiting for
   * an SDP that's never coming. This makes the *send* side self-healing too:
   * on every poll tick, if the session still doesn't reflect our local
   * offer/answer, resend it (throttled to avoid hammering the endpoint).
   */
  private resendLocalSdpIfNeeded(session?: CallPollResponse["session"] | null): void {
    const snapshot = session ?? this.lastSession;
    // IMPORTANT: this must never be awaited by the poll loop. sendSignalReliable
    // retries up to 3x with an 8s timeout each (~24s worst case) — if that were
    // awaited inside pollOnce, a single failing send would hold pollInFlight
    // true for up to 24s, freezing the entire poll cycle (session refresh,
    // remote SDP/ICE pickup, everything) even though only the *resend* was
    // stuck. That was the actual cause of "опросов" staying frozen at 1 while
    // the call sat on Звоним/Соединение. Fire-and-forget here, with its own
    // re-entrancy guard so slow attempts don't pile up.
    if (this.resendInFlight) return;
    const now = Date.now();
    if (now - this.lastSdpResendAt < 1500) return;

    if (this.isCaller && this.localOfferSdp && !snapshot?.offerSdp && this.state.callId) {
      this.lastSdpResendAt = now;
      this.resendInFlight = true;
      void this.sendSignalReliable({
        callId: this.state.callId,
        type: "offer",
        payload: this.localOfferSdp,
      }).finally(() => {
        this.resendInFlight = false;
      });
      return;
    }

    if (!this.isCaller && this.localAnswerSdp && !snapshot?.answerSdp && this.state.callId) {
      this.lastSdpResendAt = now;
      this.resendInFlight = true;
      void this.sendSignalReliable({
        callId: this.state.callId,
        type: "answer",
        payload: this.localAnswerSdp,
      }).finally(() => {
        this.resendInFlight = false;
      });
    }
  }

  private syncSdpFromSession(session: CallPollResponse["session"]): void {
    this.resendLocalSdpIfNeeded(session);
    if (this.sdpSyncInFlight) {
      const stuckMs = Date.now() - this.sdpSyncStartedAt;
      if (stuckMs < 15000) return;
      console.error(`[call] sdp sync stuck for ${stuckMs}ms — forcing reset`);
      this.sdpSyncInFlight = false;
    }
    const shouldApplyOffer =
      !this.isCaller && this.pc && !this.pc.hasRemoteDescription() && session.offerSdp;
    const shouldApplyAnswer =
      this.isCaller && this.pc && !this.pc.hasRemoteDescription() && session.answerSdp;
    if (!shouldApplyOffer && !shouldApplyAnswer) return;

    this.sdpSyncInFlight = true;
    this.sdpSyncStartedAt = Date.now();
    void (async () => {
      try {
        await this.ensureSdpApplied(session);
      } catch (err) {
        console.error("[call] Failed to apply remote SDP:", err);
        this.patchDebug({ lastError: describeError(err) });
        void this.cleanup(
          "error",
          "Не удалось установить соединение. Попробуйте Wi‑Fi или перезвоните.",
        );
      } finally {
        this.sdpSyncInFlight = false;
      }
    })();
  }

  private patchPlaybackDebug(): void {
    const d = this.pc?.getPlaybackDebug();
    if (!d) return;
    this.patchDebug(d);
  }

  private async refreshNetworkPathDebug(): Promise<void> {
    if (!this.pc) return;
    const d = await this.pc.getNetworkPathDebug();
    this.patchDebug(d);
  }

  private startNetworkDebugTimer(): void {
    this.stopNetworkDebugTimer();
    this.networkDebugTimer = setInterval(() => {
      void this.refreshNetworkPathDebug();
    }, 2000);
  }

  private stopNetworkDebugTimer(): void {
    if (this.networkDebugTimer) {
      clearInterval(this.networkDebugTimer);
      this.networkDebugTimer = null;
    }
  }

  private startVideoHealthWatch(): void {
    this.stopVideoHealthWatch();
    if (this.state.callMode !== "video" || !this.state.videoEnabled) return;
    this.videoHealthTimer = setInterval(() => void this.ensureVideoHealth(), 4000);
  }

  private stopVideoHealthWatch(): void {
    if (this.videoHealthTimer) {
      clearInterval(this.videoHealthTimer);
      this.videoHealthTimer = null;
    }
  }

  private async ensureVideoHealth(): Promise<void> {
    if (this.videoRecoveryInFlight) return;
    if (this.state.callMode !== "video" || !this.state.videoEnabled) return;
    if (
      this.state.phase !== "outgoing" &&
      this.state.phase !== "connecting" &&
      this.state.phase !== "active"
    ) {
      return;
    }
    const tracks = this.localStream?.getVideoTracks() ?? [];
    const hasLiveVideo = tracks.some((track) => track.readyState === "live");
    if (hasLiveVideo) return;
    this.videoRecoveryInFlight = true;
    try {
      this.journal.record("VIDEO_RECOVER", "restart_local_video_track");
      await this.setVideoEnabled(true);
    } catch (err) {
      this.patchDebug({ lastError: describeError(err) });
    } finally {
      this.videoRecoveryInFlight = false;
    }
  }

  private startCallAudioWatch(): void {
    if (!isIOSDevice()) return;
    this.stopCallAudioWatch();
    this.interruptionUnsub = watchCallAudioInterruptions(() => {
      void this.recoverCallAfterInterruption();
    });
  }

  private async recoverCallAfterInterruption(): Promise<void> {
    const inCall =
      this.state.phase === "connecting" ||
      this.state.phase === "outgoing" ||
      this.state.phase === "active";
    if (!inCall || !this.pc) return;

    prepareAudioSessionForCall();
    this.pc.reassertLocalCapture(this.state.muted);
    void this.pc.playRemoteAudio().then(() => this.patchPlaybackDebug());

    if (this.state.phase === "active") {
      void this.pc.recoverRemoteAudioAfterInterruption().then(() => this.patchPlaybackDebug());
      if (this.state.callId) {
        void heartbeatCall(this.state.callId);
      }
    }
    if (this.state.callMode === "video" && this.state.videoEnabled) {
      void this.setVideoEnabled(true);
    }
  }

  private stopCallAudioWatch(): void {
    this.interruptionUnsub?.();
    this.interruptionUnsub = null;
  }

  private handlePeerConnected(connected: boolean): void {
    if (!connected) return;
    if (this.state.phase === "active") {
      this.recordIgnored("ICE_CONNECTED");
      return;
    }
    this.clearIceTimeout();
    this.clearRingTimeout();
    this.clearSetupWatchdog();
    this.patch({ phase: "active" });
    this.startDurationTimer();
    this.startNetworkDebugTimer();
    this.startVideoHealthWatch();
    this.startCallAudioWatch();
    void activateCallMediaSession(this.peerPhone || this.state.peerPhone || "QHub", {
      speakerOn: this.state.speakerOn,
      videoEnabled: this.state.videoEnabled,
    });
    void setCallProximityEnabled(this.state.callMode === "audio" && !this.state.speakerOn);
    if (this.pollCallId) {
      this.startHeartbeat(this.pollCallId);
    }
    getCallSounds().stop();
    prepareAudioSessionForCall();
    void this.pc?.playRemoteAudio().then(() => this.patchPlaybackDebug());
    void this.refreshNetworkPathDebug();
    // Faster post-connect retries reduce the "caller hears later" gap on weak
    // networks and iOS Safari resume quirks.
    for (const delay of [120, 320, 700, 1400]) {
      setTimeout(() => {
        if (!this.pc?.needsPlaybackRetry()) return;
        if (isIOSDevice()) {
          prepareAudioSessionForCall();
        }
        void this.pc?.playRemoteAudio().then(() => this.patchPlaybackDebug());
      }, delay);
    }
  }

  private async bufferRemoteIce(payload: string): Promise<void> {
    if (!this.pendingRemoteIce.includes(payload)) {
      this.pendingRemoteIce.push(payload);
    }
    await this.flushPendingRemoteIce();
  }

  private async flushPendingRemoteIce(): Promise<void> {
    if (!this.pc || this.pendingRemoteIce.length === 0) {
      await this.pc?.flushPendingRemoteCandidates();
      return;
    }
    const pending = [...this.pendingRemoteIce];
    this.pendingRemoteIce = [];
    for (const payload of pending) {
      await this.pc.addIceCandidate(payload);
    }
    await this.pc.flushPendingRemoteCandidates();
  }

  private pollIntervalMs(): number {
    if (
      this.state.phase === "outgoing" ||
      this.state.phase === "connecting" ||
      this.state.phase === "incoming"
    ) {
      return CALL_CONNECT_POLL_INTERVAL_MS;
    }
    return CALL_POLL_INTERVAL_MS;
  }

  private async pollOnce(): Promise<void> {
    const callId = this.pollCallId ?? this.state.callId;
    if (!callId) return;

    // Re-entrancy guard: on a slow mobile connection a single poll round-trip
    // can easily exceed the 150ms tick interval. Without this guard, the
    // setInterval keeps firing regardless and piles up more and more
    // concurrent requests to the same endpoint on top of the one still
    // in flight — which can stall the connection (mobile browsers cap
    // concurrent connections per host) so hard that everything after the
    // first successful poll silently stops responding.
    //
    // Self-heal: if something inside a tick (e.g. a browser WebRTC/media API
    // that never resolves or rejects) manages to hang anyway, don't let the
    // guard itself become a permanent deadlock — force it open again after
    // a generous grace period so the call can still recover.
    if (this.pollInFlight) {
      const stuckMs = Date.now() - this.pollStartedAt;
      if (stuckMs < 3500) return;
      console.error(`[call] poll tick stuck for ${stuckMs}ms — forcing reset`);
      this.patchDebug({ lastError: `poll завис на ${Math.round(stuckMs / 1000)}с, перезапуск` });
      this.pollInFlight = false;
    }
    this.pollInFlight = true;
    this.pollStartedAt = Date.now();
    try {
      const result = await pollCallSignals(callId, this.sinceSeq);
      this.patchDebug({
        lastPollStatus: result.status,
        activeCallId: callId,
      });
      if (!result.data) {
        if (result.status === 404 && this.channel) {
          void this.refreshCallFromServer();
        }
        return;
      }
      await this.applyPollDataSafe(result.data);
    } catch (err) {
      console.error("[call] poll tick failed:", err);
      this.patchDebug({ lastError: describeError(err) });
    } finally {
      this.pollInFlight = false;
    }
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      if (this.callStartedAt <= 0) return;
      this.patchDebug({
        elapsedSec: Math.floor((Date.now() - this.callStartedAt) / 1000),
      });
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  /** Retries offer/answer delivery on its own schedule, independent of the
   * poll loop, so a slow/stuck poll tick can never block SDP from reaching
   * the server. */
  private startSdpKeepalive(): void {
    this.stopSdpKeepalive();
    this.sdpKeepaliveTimer = setInterval(() => {
      this.resendLocalSdpIfNeeded(this.lastSession);
    }, 1500);
  }

  private stopSdpKeepalive(): void {
    if (this.sdpKeepaliveTimer) {
      clearInterval(this.sdpKeepaliveTimer);
      this.sdpKeepaliveTimer = null;
    }
  }

  private startPolling(callId: string): void {
    this.stopPolling();
    this.pollCallId = callId;
    this.patchDebug({ activeCallId: callId });

    const realtime = getMessengerRealtimeClient();
    const channels = [`call:${callId}`];
    if (this.channel) channels.push(this.channel);
    realtime.subscribeChannels(channels);

    this.realtimeUnsub = realtime.subscribe((event) => {
      if (event.type !== "call_signal" || event.callId !== callId) return;
      void this.applyPollDataSafe({
        signals: event.signals,
        session: event.session,
      });
    });
    this.realtimeModeUnsub = realtime.onModeChange(() => {
      this.restartPollingInterval();
      void this.pollOnce();
    });

    this.scheduleCatchUpPolls();
    this.restartPollingInterval();
  }

  private scheduleCatchUpPolls(): void {
    for (const timer of this.catchUpPollTimers) {
      clearTimeout(timer);
    }
    this.catchUpPollTimers = [];
    void this.pollOnce();
    for (const delay of [250, 750]) {
      this.catchUpPollTimers.push(
        setTimeout(() => {
          void this.pollOnce();
        }, delay),
      );
    }
  }

  private async pollNow(): Promise<void> {
    await this.pollOnce();
  }

  private isSelfSignal(from: string): boolean {
    if (!this.myPhone) return false;
    return normalizeKzPhone(from) === normalizeKzPhone(this.myPhone);
  }

  private updateSoundsForPhase(phase: CallPhase): void {
    const sounds = getCallSounds();
    if (phase === "incoming") {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([400, 200, 400, 200, 400]);
      }
      void sounds.startIncoming();
      return;
    }
    if (phase === "outgoing") {
      void sounds.startOutgoing();
      return;
    }
    sounds.stop();
  }

  private queueLocalIce(candidate: IceCandidatePayload): void {
    this.iceOutBatch.push(candidate);
    if (!this.iceOutTimer) {
      this.iceOutTimer = setTimeout(() => void this.flushLocalIce(), 120);
    }
  }

  private async flushLocalIce(): Promise<void> {
    this.iceOutTimer = null;
    if (!this.iceOutBatch.length) return;
    // No callId yet (offer prepared in parallel with /call/initiate) — keep
    // the batch queued instead of dropping it; it flushes once the id arrives.
    if (!this.state.callId) return;
    const batch = this.iceOutBatch.splice(0);
    const payload = batch.length === 1 ? JSON.stringify(batch[0]) : JSON.stringify(batch);
    await this.sendSignalReliable({
      callId: this.state.callId,
      type: "ice",
      payload,
    });
  }

  private expandIcePayloads(payload: string): string[] {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
      }
    } catch {
      // single candidate payload
    }
    return [payload];
  }

  private async applyRemoteIcePayloads(payload: string): Promise<void> {
    for (const item of this.expandIcePayloads(payload)) {
      await this.bufferRemoteIce(item);
    }
  }

  private async endCallReliable(callId: string, reason: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await endCallApi(callId, reason)) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  private mapRemoteEndReason(raw?: string): CallEndReason {
    if (raw === "reject") return "reject";
    if (raw === "busy") return "busy";
    if (raw === "timeout" || raw === "ice_failed") return "timeout";
    if (raw === "error") return "error";
    return "remote_end";
  }

  private messageForRemoteEnd(raw?: string): string | null {
    if (raw === "timeout" || raw === "ice_failed") return "Нет ответа";
    if (raw === "reject") return "Звонок отклонён";
    if (raw === "busy") return "Собеседник занят";
    if (raw === "hangup") return "Собеседник завершил звонок";
    return null;
  }

  private syncFromSession(session: CallPollResponse["session"]): void {
    if (session.status !== "ended" || this.state.phase === "ended") return;
    const reason = this.mapRemoteEndReason(session.endReason);
    void this.cleanup(reason, this.messageForRemoteEnd(session.endReason) ?? undefined);
  }

  /**
   * Keep caller/callee status text convergent with the server session.
   * This removes a visible lag where one iPhone already accepted and sees media,
   * while the other still shows "Звоним...".
   */
  private syncProgressFromSession(session: CallPollResponse["session"]): void {
    if (this.state.phase === "ended") return;
    const hasRemoteAnswer = Boolean(session.answerSdp);
    const sessionConnecting = session.status === "connecting";
    if ((sessionConnecting || hasRemoteAnswer) && this.state.phase === "outgoing") {
      this.clearRingTimeout();
      getCallSounds().stop();
      this.patch({ phase: "connecting" });
      if (hasRemoteAnswer && !this.pc?.hasRemoteDescription()) {
        void this.applyRemoteAnswer(session.answerSdp!);
      }
      return;
    }
    if (sessionConnecting && this.state.phase === "incoming") {
      this.patch({ phase: "connecting" });
    }
  }

  private startSetupWatchdog(): void {
    this.clearSetupWatchdog();
    this.setupWatchdogTimer = setTimeout(() => {
      if (this.state.phase === "idle" || this.state.phase === "ended" || this.state.phase === "active") {
        return;
      }
      const callId = this.state.callId;
      void (async () => {
        if (callId) await this.endCallReliable(callId, "timeout");
        await this.cleanup("timeout", "Звонок завершён");
      })();
    }, DEFAULT_CALL_MAX_SETUP_SEC * 1000);
  }

  private clearSetupWatchdog(): void {
    if (this.setupWatchdogTimer) {
      clearTimeout(this.setupWatchdogTimer);
      this.setupWatchdogTimer = null;
    }
  }

  private async handleSignal(
    type: string,
    from: string,
    payload?: string,
  ): Promise<void> {
    if (this.isSelfSignal(from)) {
      this.recordIgnored("SELF_SIGNAL", { type });
      return;
    }
    this.journal.record("SIGNAL_RECEIVED", type, { from });

    if (type === "answer" && payload && this.isCaller) {
      if (this.state.phase === "outgoing" || this.state.phase === "connecting") {
        await this.applyRemoteAnswer(payload);
      } else {
        this.recordIgnored("ANSWER", { from });
      }
      return;
    }

    if (type === "offer" && payload && !this.isCaller) {
      // Never auto-answer during incoming ring — wait until user taps Accept.
      if (this.state.phase === "connecting" || this.state.phase === "active") {
        await this.applyRemoteOffer(payload);
      } else {
        this.recordIgnored("OFFER", { from });
      }
      return;
    }

    if (type === "ice" && payload) {
      await this.applyRemoteIcePayloads(payload);
    }

    if (type === "accept" && this.isCaller && this.state.phase === "outgoing") {
      this.clearRingTimeout();
      getCallSounds().stop();
      this.patch({ phase: "connecting" });
    }

    if (type === "reject" || type === "busy") {
      const reason: CallEndReason = type === "busy" ? "busy" : "reject";
      const msg = type === "busy" ? "Собеседник занят" : "Звонок отклонён";
      void this.cleanup(reason, msg);
    }

    if (type === "end") {
      void this.cleanup("remote_end", "Собеседник завершил звонок");
    }
  }

  private startHeartbeat(callId: string): void {
    this.stopHeartbeat();
    void heartbeatCall(callId);
    const intervalMs =
      isIOSDevice() && this.state.phase === "active"
        ? CALL_HEARTBEAT_ACTIVE_IOS_MS
        : CALL_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimer = setInterval(() => void heartbeatCall(callId), intervalMs);
  }

  private startRingTimeout(): void {
    this.clearRingTimeout();
    this.ringTimeout = setTimeout(() => {
      if (this.state.phase === "outgoing" || this.state.phase === "incoming") {
        const callId = this.state.callId;
        void (async () => {
          if (callId) await this.endCallReliable(callId, "timeout");
          await this.cleanup("timeout", "Нет ответа");
        })();
      }
    }, DEFAULT_CALL_RING_TIMEOUT_SEC * 1000);
  }

  private startIceTimeout(): void {
    this.clearIceTimeout();
    this.iceTimeout = setTimeout(() => {
      if (this.state.phase === "connecting") {
        const callId = this.state.callId;
        void (async () => {
          if (callId) await this.endCallReliable(callId, "ice_failed");
          await this.cleanup(
            "timeout",
            "Не удалось установить соединение. Попробуйте Wi‑Fi или перезвоните.",
          );
        })();
      }
    }, DEFAULT_CALL_ICE_TIMEOUT_SEC * 1000);
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    const started = Date.now();
    this.durationTimer = setInterval(() => {
      this.patch({ durationSec: Math.floor((Date.now() - started) / 1000) });
    }, 1000);
  }

  private stopPolling(): void {
    const prevCallId = this.pollCallId;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.realtimeUnsub) {
      this.realtimeUnsub();
      this.realtimeUnsub = null;
    }
    if (this.realtimeModeUnsub) {
      this.realtimeModeUnsub();
      this.realtimeModeUnsub = null;
    }
    if (prevCallId) {
      getMessengerRealtimeClient().unsubscribeChannels([`call:${prevCallId}`]);
    }
    for (const timer of this.catchUpPollTimers) {
      clearTimeout(timer);
    }
    this.catchUpPollTimers = [];
    this.pollCallId = null;
    this.pollInFlight = false;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearRingTimeout(): void {
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
  }

  private clearIceTimeout(): void {
    if (this.iceTimeout) {
      clearTimeout(this.iceTimeout);
      this.iceTimeout = null;
    }
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private async cleanup(
    endReason: CallEndReason,
    errorMessage?: string,
    options?: { skipServerEnd?: boolean },
  ): Promise<void> {
    if (this.cleanupInFlight) return;
    this.cleanupInFlight = true;
    // Invalidate in-flight getUserMedia — late-resolving captures must be
    // stopped, not adopted, or iOS keeps the mic/camera active after the call.
    this.mediaEpoch += 1;
    this.localMediaPromise = null;
    this.journal.record("CLEANUP_START", endReason ?? "null");

    const callId = this.state.callId;
    const phase: CallPhase = "ended";
    this.patch({
      phase,
      endReason,
      errorMessage: errorMessage ?? null,
    });

    this.stopPolling();
    this.stopHeartbeat();
    this.stopElapsedTimer();
    this.stopSdpKeepalive();
    this.stopNetworkDebugTimer();
    this.stopVideoHealthWatch();
    this.clearRingTimeout();
    this.clearIceTimeout();
    this.clearSetupWatchdog();
    this.stopDurationTimer();
    this.stopCallAudioWatch();
    getCallSounds().stop();

    if (this.iceOutTimer) {
      clearTimeout(this.iceOutTimer);
      this.iceOutTimer = null;
    }
    this.iceOutBatch = [];

    if (callId && !options?.skipServerEnd && !this.endedOnServer.has(callId)) {
      await this.endCallReliable(callId, endReason ?? "error");
      this.endedOnServer.add(callId);
    }

    this.lastSession = null;
    this.localOfferSdp = null;
    this.localAnswerSdp = null;
    this.pendingRemoteAnswer = null;
    this.pendingPollMerge = null;
    this.resendInFlight = false;
    this.sdpApplyInFlight = false;
    this.videoRecoveryInFlight = false;
    this.pendingRemoteIce = [];

    this.pc?.close();
    this.pc = null;
    this.setTransportPhase("closed");
    releaseCallMediaPlayback();
    purgeOrphanedCallMediaElements();
    resetCallMediaForNewCall();
    releaseCallMediaSession();

    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.emitMedia();
    restoreAudioSessionAfterCall();
    void releaseCallAudioOutput();

    this.journal.record("CLEANUP_COMPLETE");
    this.cleanupInFlight = false;

    if (endReason !== null) {
      this.scheduleReset();
    }
  }

  private scheduleReset(): void {
    setTimeout(() => this.reset(), 2500);
  }

  private reset(): void {
    this.mediaEpoch += 1;
    this.sinceSeq = 0;
    this.isCaller = false;
    this.lastSession = null;
    this.pendingRemoteAnswer = null;
    this.pendingPollMerge = null;
    this.localMediaPromise = null;
    this.cleanupInFlight = false;
    this.pendingRemoteIce = [];
    this.videoRecoveryInFlight = false;
    this.transportPhase = "new";
    this.sessionId = "s-init";
    this.journal.clear();
    this.state = { ...INITIAL_STATE };
    for (const l of this.listeners) l(this.state);
    this.emitMedia();
  }
}

let sharedController: CallController | null = null;

export function getCallController(): CallController {
  if (!sharedController) {
    sharedController = new CallController();
  }
  return sharedController;
}
