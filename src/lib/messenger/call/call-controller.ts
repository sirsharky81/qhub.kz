import {
  prepareAudioSessionForCall,
  restoreAudioSessionAfterCall,
} from "@/lib/audio-session";
import { ensureMediaPermissions } from "@/lib/platform/media-access";
import {
  CALL_HEARTBEAT_INTERVAL_MS,
  CALL_POLL_INTERVAL_MS,
  DEFAULT_CALL_ICE_TIMEOUT_SEC,
  DEFAULT_CALL_RING_TIMEOUT_SEC,
} from "../constants";
import { CallPeerConnection } from "./peer-connection";
import {
  endCallApi,
  fetchIceServers,
  heartbeatCall,
  initiateCall,
  pollActiveCall,
  pollCallSignals,
  sendCallSignal,
} from "./signaling-client";
import type { CallEndReason, CallPhase, CallState } from "./types";

type Listener = (state: CallState) => void;

const INITIAL_STATE: CallState = {
  phase: "idle",
  callId: null,
  channel: null,
  peerPhone: null,
  muted: false,
  durationSec: 0,
  errorMessage: null,
  endReason: null,
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
  private pendingOffer: string | null = null;
  private pendingRemoteIce: string[] = [];
  private destroyed = false;

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
      this.patch({
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
    };

    void tick();
    this.activePollTimer = setInterval(() => void tick(), CALL_POLL_INTERVAL_MS * 2);
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
    this.patch({
      phase: "outgoing",
      callId: result.callId,
      channel: this.channel,
      peerPhone: this.peerPhone,
      endReason: null,
      errorMessage: null,
    });

    try {
      await this.ensureLocalAudio();
      await this.setupPeerConnection();
      const offerSdp = await this.pc!.createOffer();
      await sendCallSignal({
        callId: result.callId,
        type: "offer",
        payload: offerSdp,
      });
      this.startPolling(result.callId);
      this.startHeartbeat(result.callId);
      this.startRingTimeout();
    } catch {
      await this.cleanup("error", "Не удалось получить доступ к микрофону");
    }
  }

  async acceptIncoming(): Promise<void> {
    if (this.state.phase !== "incoming" || !this.state.callId) return;

    this.clearRingTimeout();
    this.patch({ phase: "connecting" });

    try {
      await this.ensureLocalAudio();
      await this.setupPeerConnection();
      if (this.pendingOffer) {
        const offer = this.pendingOffer;
        this.pendingOffer = null;
        const answerSdp = await this.pc!.createAnswer(offer);
        await sendCallSignal({
          callId: this.state.callId,
          type: "answer",
          payload: answerSdp,
        });
        await this.flushPendingRemoteIce();
      }
      this.startIceTimeout();
      void this.pc?.playRemoteAudio();
    } catch {
      if (this.state.callId) {
        await sendCallSignal({ callId: this.state.callId, type: "reject" });
      }
      await this.cleanup("error", "Не удалось получить доступ к микрофону");
    }
  }

  async rejectIncoming(): Promise<void> {
    if (!this.state.callId) return;
    await sendCallSignal({ callId: this.state.callId, type: "reject" });
    await this.cleanup("reject");
  }

  async hangup(): Promise<void> {
    if (!this.state.callId) {
      this.reset();
      return;
    }
    await endCallApi(this.state.callId, "hangup");
    await this.cleanup("hangup");
  }

  setMuted(muted: boolean): void {
    this.pc?.setMuted(muted);
    this.patch({ muted });
  }

  async handleDeepLink(callId: string): Promise<void> {
    if (this.isInCall()) return;
    this.isCaller = false;
    this.sinceSeq = 0;
    this.patch({
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
  }

  destroy(): void {
    this.destroyed = true;
    void this.cleanup(null);
    this.stopIncomingWatch();
  }

  private patch(partial: Partial<CallState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }

  private async ensureLocalAudio(): Promise<void> {
    prepareAudioSessionForCall();
    await ensureMediaPermissions({ audio: true });
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  }

  private async setupPeerConnection(): Promise<void> {
    const iceServers = await fetchIceServers();
    this.pc = new CallPeerConnection();
    await this.pc.init(iceServers);
    if (this.localStream) {
      await this.pc.attachLocalAudio(this.localStream);
    }
    this.pc.setHandlers({
      onIceCandidate: (candidate) => {
        if (!this.state.callId) return;
        void sendCallSignal({
          callId: this.state.callId,
          type: "ice",
          payload: JSON.stringify(candidate),
        });
      },
      onConnectionState: (connState) => {
        this.handlePeerConnected(connState === "connected");
        if (connState === "failed") {
          void this.cleanup(
            "error",
            "Не удалось установить соединение. Попробуйте Wi‑Fi или перезвоните.",
          );
        }
      },
      onIceConnectionState: (iceState) => {
        this.handlePeerConnected(iceState === "connected" || iceState === "completed");
      },
    });
  }

  private handlePeerConnected(connected: boolean): void {
    if (!connected || this.state.phase === "active") return;
    this.clearIceTimeout();
    this.clearRingTimeout();
    this.patch({ phase: "active" });
    this.startDurationTimer();
    void this.pc?.playRemoteAudio();
  }

  private async bufferRemoteIce(payload: string): Promise<void> {
    if (!this.pendingRemoteIce.includes(payload)) {
      this.pendingRemoteIce.push(payload);
    }
    await this.flushPendingRemoteIce();
  }

  private async flushPendingRemoteIce(): Promise<void> {
    if (!this.pc || this.pendingRemoteIce.length === 0) return;
    const pending = [...this.pendingRemoteIce];
    this.pendingRemoteIce = [];
    for (const payload of pending) {
      await this.pc.addIceCandidate(payload);
    }
    // Re-queue any that peer-connection could not apply yet.
    // addIceCandidate queues internally when remote description is missing.
  }

  private startPolling(callId: string): void {
    this.stopPolling();
    const tick = async () => {
      const data = await pollCallSignals(callId, this.sinceSeq);
      if (!data) return;

      for (const signal of data.signals) {
        this.sinceSeq = Math.max(this.sinceSeq, signal.seq);
        await this.handleSignal(signal.type, signal.from, signal.payload);
      }

      if (data.session.status === "ended" && this.state.phase !== "ended") {
        const reason: CallEndReason =
          data.session.endReason === "reject"
            ? "reject"
            : data.session.endReason === "busy"
              ? "busy"
              : "remote_end";
        void this.cleanup(reason);
      }
    };

    void tick();
    this.pollTimer = setInterval(() => void tick(), CALL_POLL_INTERVAL_MS);
  }

  private async handleSignal(
    type: string,
    from: string,
    payload?: string,
  ): Promise<void> {
    if (from === this.myPhone) return;

    if (type === "offer" && payload && !this.isCaller) {
      if (this.state.phase === "incoming") {
        this.pendingOffer = payload;
        return;
      }
      if (this.state.phase === "connecting" || this.state.phase === "active") {
        return;
      }
      if (!this.pc) {
        try {
          await this.ensureLocalAudio();
          await this.setupPeerConnection();
        } catch {
          await this.rejectIncoming();
          return;
        }
      }
      const answerSdp = await this.pc!.createAnswer(payload);
      if (this.state.callId) {
        await sendCallSignal({
          callId: this.state.callId,
          type: "answer",
          payload: answerSdp,
        });
      }
      await this.flushPendingRemoteIce();
      this.patch({ phase: "connecting" });
      this.startIceTimeout();
    }

    if (type === "answer" && payload && this.isCaller) {
      await this.pc?.applyAnswer(payload);
      await this.flushPendingRemoteIce();
      this.patch({ phase: "connecting" });
      this.startIceTimeout();
    }

    if (type === "ice" && payload) {
      await this.bufferRemoteIce(payload);
    }

    if (type === "reject" || type === "busy") {
      const reason: CallEndReason = type === "busy" ? "busy" : "reject";
      const msg = type === "busy" ? "Собеседник занят" : "Звонок отклонён";
      void this.cleanup(reason, msg);
    }

    if (type === "end") {
      void this.cleanup("remote_end");
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
          if (callId) await endCallApi(callId, "timeout");
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
          if (callId) await endCallApi(callId, "ice_failed");
          await this.cleanup(
            "error",
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
    this.clearRingTimeout();
    this.clearIceTimeout();
    this.stopDurationTimer();

    this.pendingOffer = null;
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
    this.pendingOffer = null;
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
