import { fetchAssistIceServers, pollAssistRoom, sendAssistSignal, type AssistSession } from "./client";
import type { AssistSignal } from "./store";

export type AssistLinkState = "idle" | "connecting" | "connected" | "failed" | "closed";

export class AssistPeer {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeq = 0;
  private makingOffer = false;
  private closed = false;
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
    this.onState("connecting");
    const iceServers = await fetchAssistIceServers();
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === "connected") this.onState("connected");
      if (state === "failed") this.onState("failed");
      if (state === "closed") this.onState("closed");
    };
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this.closed) return;
      void sendAssistSignal(this.session, "ice", JSON.stringify(ev.candidate.toJSON())).catch(() => undefined);
    };

    if (this.session.role === "master") {
      this.dc = this.pc.createDataChannel("qhub-subaru-assist", { ordered: true });
      this.bindChannel(this.dc);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.dc = ev.channel;
        this.bindChannel(this.dc);
      };
    }

    this.pc.onnegotiationneeded = () => {
      void this.negotiate();
    };

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, 1000);
    void this.poll();
  }

  private bindChannel(channel: RTCDataChannel): void {
    channel.onopen = () => this.onState("connected");
    channel.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      for (const listener of this.messageListeners) listener(ev.data);
    };
  }

  private async negotiate(): Promise<void> {
    if (!this.pc || this.makingOffer || this.closed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription(await this.pc.createOffer());
      const local = this.pc.localDescription;
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
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.dc?.close();
    this.pc?.close();
    this.onState("closed");
  }
}
