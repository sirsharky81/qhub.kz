import {
  prepareAudioSessionForCall,
  restoreAudioSessionAfterCall,
} from "@/lib/audio-session";
import { ensureMediaPermissions } from "@/lib/platform/media-access";
import {
  CALL_CONNECT_POLL_INTERVAL_MS,
  CALL_DISCOVERY_POLL_INTERVAL_MS,
  CALL_HEARTBEAT_INTERVAL_MS,
  CALL_POLL_INTERVAL_MS,
  DEFAULT_CALL_ICE_TIMEOUT_SEC,
  DEFAULT_CALL_MAX_SETUP_SEC,
  DEFAULT_CALL_RING_TIMEOUT_SEC,
} from "../constants";
import { normalizeKzPhone } from "../phone";
import { getCallSounds } from "./call-sounds";
import { CallPeerConnection, type IceCandidatePayload } from "./peer-connection";
import {
  endCallApi,
  fetchIceServers,
  heartbeatCall,
  initiateCall,
  pollActiveCall,
  pollCallSignals,
  sendCallSignal,
  sendCallSignalDetailed,
} from "./signaling-client";
import type { CallDebugInfo, CallEndReason, CallPhase, CallState } from "./types";
import type { CallPollResponse } from "./types";

type Listener = (state: CallState) => void;

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
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
};

const INITIAL_STATE: CallState = {
  phase: "idle",
  callId: null,
  channel: null,
  peerPhone: null,
  muted: false,
  speakerOn: true,
  durationSec: 0,
  errorMessage: null,
  endReason: null,
  debug: { ...INITIAL_DEBUG },
};

export class CallController {
  private state: CallState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();
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
  private iceOutBatch: IceCandidatePayload[] = [];
  private iceOutTimer: ReturnType<typeof setTimeout> | null = null;
  private setupWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

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

  getState(): CallState {
    return this.state;
  }

  isInCall(): boolean {
    return this.state.phase !== "idle" && this.state.phase !== "ended";
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
        endReason: null,
        errorMessage: null,
      });
      this.startPolling(data.session.callId);
      this.startHeartbeat(data.session.callId);
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

  async startOutgoing(): Promise<void> {
    if (this.isInCall()) return;

    const result = await initiateCall({
      channel: this.channel,
      peerPhone: this.peerPhone,
    });

    if (!result.ok || !result.callId) {
      const msg =
        result.error === "busy"
          ? "Собеседник занят"
          : "Не удалось начать звонок";
      this.patch({ phase: "ended", errorMessage: msg, endReason: "busy" });
      this.scheduleReset();
      return;
    }

    this.isCaller = true;
    this.sinceSeq = 0;
    this.lastSession = null;
    this.localOfferSdp = null;
    this.localAnswerSdp = null;
    this.callStartedAt = Date.now();
    this.patch({
      debug: { ...INITIAL_DEBUG, isCaller: true },
      phase: "outgoing",
      callId: result.callId,
      channel: this.channel,
      peerPhone: this.peerPhone,
      endReason: null,
      errorMessage: null,
    });

    // Start signaling immediately — don't wait for getUserMedia / ICE config.
    // On mobile, mic permission + TURN fetch can take many seconds; the callee
    // must be able to poll the session and receive the offer as soon as it's
    // ready. Previously polling started only after WebRTC setup, so the whole
    // handshake was frozen until metered.ca + getUserMedia finished.
    this.startPolling(result.callId);
    this.startHeartbeat(result.callId);
    this.startRingTimeout();
    this.startSetupWatchdog();
    this.startElapsedTimer();
    this.startSdpKeepalive();

    try {
      await this.ensureLocalAudio();
      await this.setupPeerConnection();
      const offerSdp = await this.pc!.createOffer();
      this.localOfferSdp = offerSdp;
      this.patchDebug({ hasLocalOffer: true });

      void this.sendSignalReliable({
        callId: result.callId,
        type: "offer",
        payload: offerSdp,
      });
    } catch (err) {
      this.patchDebug({ lastError: describeError(err) });
      await this.cleanup("error", "Не удалось получить доступ к микрофону");
    }
  }

  async acceptIncoming(): Promise<void> {
    if (this.state.phase !== "incoming" || !this.state.callId) return;

    this.clearRingTimeout();
    this.localAnswerSdp = null;
    this.patch({ phase: "connecting" });

    try {
      await this.ensureLocalAudio();
      await this.setupPeerConnection();

      const offerSdp = this.lastSession?.offerSdp;
      if (offerSdp) {
        await this.applyRemoteOffer(offerSdp);
      } else {
        // Offer not observed locally yet — the next poll tick will pick it up
        // via syncSdpFromSession as soon as it's visible on the session.
        void this.pollNow();
      }
    } catch (err) {
      this.patchDebug({ lastError: describeError(err) });
      if (this.state.callId) {
        await sendCallSignal({ callId: this.state.callId, type: "reject" });
      }
      await this.cleanup("error", "Не удалось получить доступ к микрофону");
    }
  }

  async rejectIncoming(): Promise<void> {
    if (!this.state.callId) return;
    const callId = this.state.callId;
    await this.sendSignalReliable({ callId, type: "reject" });
    await this.endCallReliable(callId, "reject");
    await this.cleanup("reject");
  }

  async hangup(): Promise<void> {
    if (!this.state.callId) {
      this.reset();
      return;
    }
    const callId = this.state.callId;
    await this.flushLocalIce();
    // endCallReliable (POST /call/end) already appends the "end" signal AND
    // sets endReason to the specific reason ("hangup"). Sending a separate
    // "end" signal first used to hardcode endReason to the generic "end",
    // so the remote peer lost the friendly "Собеседник завершил звонок"
    // message — endCallReliable alone covers both.
    await this.endCallReliable(callId, "hangup");
    await this.cleanup("hangup");
  }

  setMuted(muted: boolean): void {
    this.pc?.setMuted(muted);
    this.patch({ muted });
  }

  setSpeaker(speakerOn: boolean): void {
    this.pc?.setSpeakerphone(speakerOn);
    this.patch({ speakerOn });
    void this.pc?.playRemoteAudio();
  }

  async handleDeepLink(
    callId: string,
    opts?: { channel?: string; peerPhone?: string },
  ): Promise<void> {
    if (this.isInCall()) return;
    if (opts?.channel) this.channel = opts.channel;
    if (opts?.peerPhone) this.peerPhone = opts.peerPhone;
    this.isCaller = false;
    this.sinceSeq = 0;
    this.lastSession = null;
    this.callStartedAt = Date.now();
    this.patch({
      debug: { ...INITIAL_DEBUG },
      phase: "incoming",
      callId,
      channel: this.channel,
      peerPhone: this.peerPhone,
      endReason: null,
      errorMessage: null,
    });
    this.startPolling(callId);
    this.startHeartbeat(callId);
    this.startRingTimeout();
    this.startSetupWatchdog();
    this.startElapsedTimer();
    this.startSdpKeepalive();
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
    if (!this.pollTimer || !this.pollCallId) return;
    clearInterval(this.pollTimer);
    const callId = this.pollCallId;
    this.pollTimer = setInterval(
      () => void this.pollOnce(callId),
      this.pollIntervalMs(),
    );
  }

  private async ensureLocalAudio(): Promise<void> {
    prepareAudioSessionForCall();
    await withTimeout(ensureMediaPermissions({ audio: true }), 15000, "media_permissions");
    this.localStream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      }),
      15000,
      "get_user_media",
    );
  }

  private async setupPeerConnection(): Promise<void> {
    const { iceServers, turnSource } = await fetchIceServers();
    this.patchDebug({ turnSource, isCaller: this.isCaller });
    this.pc = new CallPeerConnection();
    await this.pc.init(iceServers);
    if (this.localStream) {
      await this.pc.attachLocalAudio(this.localStream);
    }
    this.pc.setSpeakerphone(this.state.speakerOn);
    this.pc.setHandlers({
      onIceCandidate: (candidate) => {
        if (!this.state.callId) return;
        if (!candidate.candidate) {
          void this.flushLocalIce();
          return;
        }
        this.queueLocalIce(candidate);
      },
      onConnectionState: (connState) => {
        this.patchDebug({ connectionState: connState });
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
        void this.pc?.playRemoteAudio();
        this.handlePeerConnected(true);
      },
    });
  }

  private async sendSignalReliable(params: {
    callId: string;
    type: "offer" | "answer" | "ice" | "reject" | "end" | "busy";
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

  private async applyRemoteAnswer(payload: string): Promise<void> {
    if (!this.pc || this.pc.hasRemoteDescription()) return;
    this.isCaller = true;
    this.clearRingTimeout();
    getCallSounds().stop();
    await this.pc.applyAnswer(payload);
    this.patchDebug({ hasRemoteDescription: true });
    await this.flushPendingRemoteIce();
    this.patch({ phase: "connecting" });
    this.startIceTimeout();
    void this.pc.playRemoteAudio();
  }

  private async applyRemoteOffer(offerPayload: string): Promise<void> {
    if (this.pc?.hasRemoteDescription()) return;
    if (!this.pc) {
      await this.ensureLocalAudio();
      await this.setupPeerConnection();
    }
    const answerSdp = await this.pc!.createAnswer(offerPayload);
    this.localAnswerSdp = answerSdp;
    this.patchDebug({ hasRemoteDescription: true, hasLocalAnswer: true });
    await this.flushPendingRemoteIce();
    await this.pc?.flushPendingRemoteCandidates();
    this.patch({ phase: "connecting" });
    this.startIceTimeout();
    void this.pc?.playRemoteAudio();

    // Fire-and-forget, same reasoning as the offer send in startOutgoing:
    // don't let a stalled send delay arming the ICE timeout above. The poll
    // loop's resendLocalSdpIfNeeded resends this if the session doesn't
    // reflect it yet, and sendCallSignal itself is now time-bounded either way.
    if (this.state.callId) {
      void this.sendSignalReliable({
        callId: this.state.callId,
        type: "answer",
        payload: answerSdp,
      });
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
    if (this.sdpSyncInFlight) return;
    const shouldApplyOffer =
      !this.isCaller && this.pc && !this.pc.hasRemoteDescription() && session.offerSdp;
    const shouldApplyAnswer =
      this.isCaller && this.pc && !this.pc.hasRemoteDescription() && session.answerSdp;
    if (!shouldApplyOffer && !shouldApplyAnswer) return;

    this.sdpSyncInFlight = true;
    void (async () => {
      try {
        if (shouldApplyOffer) {
          await this.applyRemoteOffer(session.offerSdp!);
        }
        if (shouldApplyAnswer) {
          await this.applyRemoteAnswer(session.answerSdp!);
        }
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

  private handlePeerConnected(connected: boolean): void {
    if (!connected || this.state.phase === "active") return;
    this.clearIceTimeout();
    this.clearRingTimeout();
    this.clearSetupWatchdog();
    this.patch({ phase: "active" });
    this.startDurationTimer();
    getCallSounds().stop();
    void this.pc?.playRemoteAudio();
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

  private async pollOnce(callId: string): Promise<void> {
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
      if (stuckMs < 10000) return;
      console.error(`[call] poll tick stuck for ${stuckMs}ms — forcing reset`);
      this.patchDebug({ lastError: `poll завис на ${Math.round(stuckMs / 1000)}с, перезапуск` });
    }
    this.pollInFlight = true;
    this.pollStartedAt = Date.now();
    try {
      const data = await pollCallSignals(callId, this.sinceSeq);
      if (!data) return;

      for (const signal of data.signals) {
        this.sinceSeq = Math.max(this.sinceSeq, signal.seq);
        void this.handleSignal(signal.type, signal.from, signal.payload);
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

      this.syncSdpFromSession(data.session);
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
    void this.pollOnce(callId);
    this.pollTimer = setInterval(() => void this.pollOnce(callId), this.pollIntervalMs());
  }

  private async pollNow(): Promise<void> {
    const callId = this.pollCallId ?? this.state.callId;
    if (!callId) return;
    await this.pollOnce(callId);
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
    const batch = this.iceOutBatch.splice(0);
    if (!batch.length || !this.state.callId) return;
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
    if (this.isSelfSignal(from)) return;

    // "offer"/"answer" are applied via syncSdpFromSession (level-triggered from
    // the session's offerSdp/answerSdp), which is robust against a dropped signal.

    if (type === "ice" && payload) {
      await this.applyRemoteIcePayloads(payload);
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
    this.heartbeatTimer = setInterval(() => void heartbeatCall(callId), CALL_HEARTBEAT_INTERVAL_MS);
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
  ): Promise<void> {
    this.stopPolling();
    this.stopHeartbeat();
    this.stopElapsedTimer();
    this.stopSdpKeepalive();
    this.clearRingTimeout();
    this.clearIceTimeout();
    this.clearSetupWatchdog();
    this.stopDurationTimer();
    getCallSounds().stop();

    if (this.iceOutTimer) {
      clearTimeout(this.iceOutTimer);
      this.iceOutTimer = null;
    }
    this.iceOutBatch = [];

    this.lastSession = null;
    this.localOfferSdp = null;
    this.localAnswerSdp = null;
    this.resendInFlight = false;
    this.pendingRemoteIce = [];

    this.pc?.close();
    this.pc = null;

    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    restoreAudioSessionAfterCall();

    const phase: CallPhase = "ended";
    this.patch({
      phase,
      endReason,
      errorMessage: errorMessage ?? null,
    });

    if (endReason !== null) {
      this.scheduleReset();
    }
  }

  private scheduleReset(): void {
    setTimeout(() => this.reset(), 2500);
  }

  private reset(): void {
    this.sinceSeq = 0;
    this.isCaller = false;
    this.lastSession = null;
    this.pendingRemoteIce = [];
    this.state = { ...INITIAL_STATE };
    for (const l of this.listeners) l(this.state);
    if (!this.destroyed) {
      this.startIncomingWatch();
    }
  }
}

let sharedController: CallController | null = null;

export function getCallController(): CallController {
  if (!sharedController) {
    sharedController = new CallController();
  }
  return sharedController;
}
