import { fetchAssistIceServers, pollAssistRoom, sendAssistSignal, type AssistSession } from "./client";
import type { AssistSignal } from "./store";

export type AssistLinkState = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";

export class AssistPeer {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq = 0;
  private makingOffer = false;
  private closed = false;
  private generation = 0;
  private everConnected = false;
  private messageListeners = new Set<(raw: string) => void>();

  constructor(
    private session: AssistSession,
    private onState: (state: AssistLinkState) => void,
  ) {}

  onMessage(listener: (raw: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  async start(): Promise<void> {
    this.closed = false;
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        void this.poll();
      }, 1000);
    }
    await this.openPeer(false);
    void this.poll();
  }

  /** Rebuild only the phone-to-phone channel. The caller's vLinker session stays untouched. */
  async restart(): Promise<void> {
    if (this.closed) return;
    this.clearRestartTimer();
    this.teardownPeer();
    await this.openPeer(this.everConnected);
  }

  ensureConnected(): void {
    if (this.closed || this.isOpen()) return;
    void this.restart();
  }

  private async openPeer(reconnecting: boolean): Promise<void> {
    if (this.closed) return;
    const generation = ++this.generation;
    this.onState(reconnecting ? "reconnecting" : "connecting");
    const iceServers = await fetchAssistIceServers();
    if (this.closed || generation !== this.generation) return;

    if (this.closed || generation !== this.generation) return;
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (generation !== this.generation || this.pc !== pc) return;
      const state = pc.connectionState;
      if (state === "connected") {
        this.everConnected = true;
        this.clearRestartTimer();
        this.onState("connected");
      } else if (state === "failed") {
        this.scheduleRestart(800);
      } else if (state === "disconnected") {
        this.scheduleRestart(4000);
      }
    };
    pc.onicecandidate = (ev) => {
      if (!ev.candidate || this.closed || generation !== this.generation) return;
      void sendAssistSignal(this.session, "ice", JSON.stringify(ev.candidate.toJSON())).catch(() => undefined);
    };

    if (this.session.role === "master") {
      this.dc = pc.createDataChannel("qhub-subaru-assist", { ordered: true });
      this.bindChannel(this.dc);
    } else {
      pc.ondatachannel = (ev) => {
        if (generation !== this.generation) return;
        this.dc = ev.channel;
        this.bindChannel(this.dc);
      };
    }

    pc.onnegotiationneeded = () => {
      if (generation !== this.generation) return;
      void this.negotiate();
    };
  }

  private scheduleRestart(delayMs: number): void {
    if (this.closed || this.restartTimer) return;
    this.onState("reconnecting");
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.restart();
    }, delayMs);
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private teardownPeer(): void {
    this.generation += 1;
    const pc = this.pc;
    const dc = this.dc;
    this.pc = null;
    this.dc = null;
    this.makingOffer = false;
    try {
      dc?.close();
    } catch {
      /* already closing */
    }
    try {
      pc?.close();
    } catch {
      /* already closing */
    }
  }

  private bindChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.everConnected = true;
      this.clearRestartTimer();
      this.onState("connected");
    };
    channel.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      for (const listener of this.messageListeners) listener(ev.data);
    };
    channel.onclose = () => {
      if (this.closed || this.dc !== channel) return;
      this.scheduleRestart(800);
    };
  }

  private async negotiate(): Promise<void> {
    if (!this.pc || this.makingOffer || this.closed) return;
    try {
      const pc = this.pc;
      const generation = this.generation;
      this.makingOffer = true;
      await pc.setLocalDescription(await pc.createOffer());
      if (this.pc !== pc || generation !== this.generation) return;
      const local = pc.localDescription;
      if (local) await sendAssistSignal(this.session, "offer", JSON.stringify(local.toJSON()));
    } finally {
      this.makingOffer = false;
    }
  }

  private async poll(): Promise<void> {
    if (this.closed || !this.pc) return;
    try {
      const snapshot = await pollAssistRoom(this.session, this.lastSeq);
      this.lastSeq = Math.max(this.lastSeq, snapshot.latestSeq);
      for (const signal of snapshot.signals) {
        await this.applySignal(signal);
      }
    } catch {
      /* next poll retries signaling */
    }
  }

  private async applySignal(signal: AssistSignal): Promise<void> {
    if (!this.pc || signal.fromMemberId === this.session.memberId || !signal.payload) return;
    if (signal.type === "offer") {
      const offerCollision = this.makingOffer || this.pc.signalingState !== "stable";
      if (this.session.role === "master" && offerCollision) return;
      await this.pc.setRemoteDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit);
      if (this.pc.signalingState === "have-remote-offer") {
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        const local = this.pc.localDescription;
        if (local) await sendAssistSignal(this.session, "answer", JSON.stringify(local.toJSON()));
      }
      return;
    }
    if (signal.type === "answer" && this.pc.signalingState === "have-local-offer") {
      await this.pc.setRemoteDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit);
      return;
    }
    if (signal.type === "ice") {
      try {
        await this.pc.addIceCandidate(JSON.parse(signal.payload) as RTCIceCandidateInit);
      } catch {
        /* stale candidate */
      }
    }
  }

  send(raw: string): void {
    if (this.dc?.readyState === "open") this.dc.send(raw);
  }

  isOpen(): boolean {
    return this.dc?.readyState === "open";
  }

  close(): void {
    this.closed = true;
    this.clearRestartTimer();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.teardownPeer();
    this.onState("closed");
  }
}
