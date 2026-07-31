import { fetchShareIceServers, pollShareRoomApi, sendShareSignalApi } from "./client";
import { ShareRealtimeClient } from "./realtime/client";
import { isShareWsEnabled } from "./realtime/config";
import type { ShareSession, ShareSignal } from "./types";

export type ShareConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";

export interface SharePeerCallbacks {
  onConnectionState?: (state: ShareConnectionState) => void;
  onPeerDeviceName?: (name: string) => void;
  onDataMessage?: (raw: string) => void;
  onError?: (err: Error) => void;
  onTransport?: (mode: "ws" | "poll") => void;
}

export class SharePeerConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private realtime: ShareRealtimeClient | null = null;
  private wsActive = false;
  private lastSeq = 0;
  private makingOffer = false;
  private ignoreOffer = false;
  private polite: boolean;
  private closed = false;
  private messageListeners = new Set<(raw: string) => void>();

  onMessage(listener: (raw: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private emitMessage(raw: string): void {
    for (const listener of this.messageListeners) listener(raw);
  }

  constructor(
    private session: ShareSession,
    polite: boolean,
    private callbacks: SharePeerCallbacks,
  ) {
    this.polite = polite;
  }

  async start(): Promise<void> {
    this.callbacks.onConnectionState?.("connecting");
    const iceServers = await fetchShareIceServers();
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === "connected") this.callbacks.onConnectionState?.("connected");
      if (state === "failed") this.callbacks.onConnectionState?.("failed");
      if (state === "closed") this.callbacks.onConnectionState?.("closed");
    };

    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void sendShareSignalApi(this.session, "ice", JSON.stringify(ev.candidate.toJSON())).catch((err) =>
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err))),
      );
    };

    if (this.session.role === "host") {
      this.dc = this.pc.createDataChannel("qhub-share", { ordered: true });
      this.setupDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.dc = ev.channel;
        this.setupDataChannel(this.dc);
      };
    }

    this.pc.onnegotiationneeded = () => {
      void this.handleNegotiationNeeded();
    };

    this.startTransport();
  }

  private startTransport(): void {
    if (isShareWsEnabled()) {
      this.realtime = new ShareRealtimeClient(this.session, {
        onSignal: (signal) => {
          void this.handleSignal(signal);
        },
        onRoomEvent: (event) => {
          if (event.type === "member_joined" && event.displayName) {
            this.callbacks.onPeerDeviceName?.(event.displayName);
          }
        },
        onConnected: () => {
          this.wsActive = true;
          this.callbacks.onTransport?.("ws");
        },
        onDisconnected: () => {
          this.wsActive = false;
          this.callbacks.onTransport?.("poll");
        },
        onError: (err) => this.callbacks.onError?.(err),
      });
      const started = this.realtime.start();
      if (!started) this.wsActive = false;
    }

    this.startPolling(this.wsActive ? 3000 : 1200);
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      channel.send(JSON.stringify({ t: "hello", deviceName: this.session.deviceName }));
    };
    channel.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        const msg = JSON.parse(ev.data) as { t?: string; deviceName?: string };
        if (msg.t === "hello" && msg.deviceName) {
          this.callbacks.onPeerDeviceName?.(msg.deviceName);
        }
        this.callbacks.onDataMessage?.(ev.data);
        this.emitMessage(ev.data);
      }
    };
  }

  private async handleNegotiationNeeded(): Promise<void> {
    if (!this.pc || this.makingOffer) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await sendShareSignalApi(
        this.session,
        "offer",
        JSON.stringify(this.pc.localDescription?.toJSON()),
      );
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.makingOffer = false;
    }
  }

  private startPolling(intervalMs: number): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, intervalMs);
    void this.pollOnce();
    if (!this.wsActive) this.callbacks.onTransport?.("poll");
  }

  private async pollOnce(): Promise<void> {
    if (this.closed || !this.pc) return;
    try {
      const snapshot = await pollShareRoomApi(this.session, this.wsActive ? this.lastSeq : this.lastSeq);
      if (!this.wsActive) {
        for (const signal of snapshot.signals) {
          await this.handleSignal(signal);
        }
        this.lastSeq = snapshot.latestSeq;
      } else if (snapshot.signals.length) {
        this.lastSeq = snapshot.latestSeq;
      }
      if (snapshot.peer?.deviceName) {
        this.callbacks.onPeerDeviceName?.(snapshot.peer.deviceName);
      }
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleSignal(signal: ShareSignal): Promise<void> {
    if (!this.pc || signal.fromParticipantId === this.session.participantId) return;
    if (signal.seq <= this.lastSeq) return;
    this.lastSeq = Math.max(this.lastSeq, signal.seq);

    if (signal.type === "offer" && signal.payload) {
      const offerCollision = this.makingOffer || this.pc.signalingState !== "stable";
      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;

      await this.pc.setRemoteDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit);
      if (this.pc.signalingState === "have-remote-offer") {
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        await sendShareSignalApi(
          this.session,
          "answer",
          JSON.stringify(this.pc.localDescription?.toJSON()),
        );
      }
    }

    if (signal.type === "answer" && signal.payload) {
      if (this.pc.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit);
      }
    }

    if (signal.type === "ice" && signal.payload) {
      try {
        await this.pc.addIceCandidate(JSON.parse(signal.payload) as RTCIceCandidateInit);
      } catch {
        /* ignore stale candidates */
      }
    }
  }

  send(raw: string): void {
    if (this.dc?.readyState === "open") {
      this.dc.send(raw);
    }
  }

  /** Send with backpressure — waits until the SCTP send buffer has space. */
  async sendReliable(raw: string): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") {
      throw new Error("data_channel_not_open");
    }
    await this.waitForSendBuffer(dc);
    dc.send(raw);
  }

  private waitForSendBuffer(dc: RTCDataChannel): Promise<void> {
    const lowWatermark = 128 * 1024;
    if (dc.bufferedAmount <= lowWatermark) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        dc.removeEventListener("bufferedamountlow", onLow);
        reject(new Error("send_buffer_timeout"));
      }, 90_000);

      const onLow = () => {
        if (dc.bufferedAmount <= lowWatermark) {
          window.clearTimeout(timeout);
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }
      };

      dc.bufferedAmountLowThreshold = lowWatermark;
      dc.addEventListener("bufferedamountlow", onLow);
    });
  }

  isConnected(): boolean {
    return this.dc?.readyState === "open";
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  close(): void {
    this.closed = true;
    this.realtime?.close();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.dc?.close();
    this.pc?.close();
    this.callbacks.onConnectionState?.("closed");
  }
}
