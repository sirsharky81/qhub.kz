import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { getNativePlatform, isNativePlatform } from "@/lib/platform/runtime";
import { fetchIceServers } from "./signaling-client";

type ScreenSignalType = "screen-offer" | "screen-answer" | "screen-ice" | "screen-stop";

type NativeScreenEvent = {
  type: "offer" | "ice" | "stopped" | "error";
  payload?: string;
  message?: string;
};

interface NativeScreenSharePlugin {
  start(options: { iceServersJson: string }): Promise<void>;
  applyAnswer(options: { sdp: string }): Promise<void>;
  addIceCandidate(options: {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "signal",
    listener: (event: NativeScreenEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeScreenShare = registerPlugin<NativeScreenSharePlugin>("ScreenShare");

export function canUseNativeScreenShare(): boolean {
  return isNativePlatform() && getNativePlatform() === "android";
}

export class CallScreenShare {
  private nativeListener: PluginListenerHandle | null = null;
  private senderActive = false;
  private receiverPc: RTCPeerConnection | null = null;
  private receiverStream: MediaStream | null = null;
  private pendingReceiverIce: RTCIceCandidateInit[] = [];
  private stoppedByOwner = false;
  private lastRemoteOffer: string | null = null;
  private lastRemoteAnswer: string | null = null;

  constructor(
    private readonly sendSignal: (type: ScreenSignalType, payload?: string) => void,
    private readonly onRemoteStream: (stream: MediaStream | null) => void,
    private readonly onLocalState: (active: boolean, error?: string) => void,
  ) {}

  isLocalActive(): boolean {
    return this.senderActive;
  }

  async startLocal(): Promise<void> {
    if (!canUseNativeScreenShare() || this.senderActive) return;
    this.stoppedByOwner = false;
    this.lastRemoteAnswer = null;
    const { iceServers } = await fetchIceServers();
    this.nativeListener = await NativeScreenShare.addListener("signal", (event) => {
      if (event.type === "offer" && event.payload) {
        this.senderActive = true;
        this.onLocalState(true);
        this.sendSignal("screen-offer", event.payload);
        return;
      }
      if (event.type === "ice" && event.payload) {
        this.sendSignal("screen-ice", event.payload);
        return;
      }
      if (event.type === "stopped") {
        const shouldNotifyPeer = this.senderActive && !this.stoppedByOwner;
        this.senderActive = false;
        this.onLocalState(false);
        if (shouldNotifyPeer) this.sendSignal("screen-stop");
        return;
      }
      if (event.type === "error") {
        this.senderActive = false;
        this.onLocalState(false, event.message ?? "Не удалось начать демонстрацию экрана");
      }
    });

    try {
      await NativeScreenShare.start({ iceServersJson: JSON.stringify(iceServers) });
    } catch (err) {
      await this.removeNativeListener();
      this.onLocalState(false, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async stopLocal(notifyPeer = true): Promise<void> {
    if (!this.senderActive && !this.nativeListener) return;
    this.stoppedByOwner = true;
    const wasActive = this.senderActive;
    this.senderActive = false;
    this.onLocalState(false);
    if (notifyPeer && wasActive) this.sendSignal("screen-stop");
    await NativeScreenShare.stop().catch(() => {});
    await this.removeNativeListener();
  }

  async handleSignal(type: ScreenSignalType, payload?: string): Promise<void> {
    if (type === "screen-offer" && payload) {
      if (payload === this.lastRemoteOffer) return;
      this.lastRemoteOffer = payload;
      await this.acceptRemoteOffer(payload);
      return;
    }
    if (type === "screen-answer" && payload && this.senderActive) {
      if (payload === this.lastRemoteAnswer) return;
      this.lastRemoteAnswer = payload;
      await NativeScreenShare.applyAnswer({ sdp: payload });
      return;
    }
    if (type === "screen-ice" && payload) {
      const candidate = this.parseCandidate(payload);
      if (!candidate) return;
      if (this.senderActive) {
        await NativeScreenShare.addIceCandidate({
          candidate: candidate.candidate ?? "",
          sdpMid: candidate.sdpMid ?? undefined,
          sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        });
      } else if (this.receiverPc?.remoteDescription) {
        await this.receiverPc.addIceCandidate(candidate).catch(() => {
          this.pendingReceiverIce.push(candidate);
        });
      } else {
        this.pendingReceiverIce.push(candidate);
      }
      return;
    }
    if (type === "screen-stop") {
      this.stopRemote();
      this.lastRemoteOffer = null;
      this.lastRemoteAnswer = null;
    }
  }

  async close(): Promise<void> {
    await this.stopLocal(false);
    this.stopRemote();
    this.lastRemoteOffer = null;
    this.lastRemoteAnswer = null;
  }

  private async acceptRemoteOffer(payload: string): Promise<void> {
    const earlyIce = this.pendingReceiverIce;
    this.stopRemote();
    this.pendingReceiverIce = earlyIce;
    const { iceServers } = await fetchIceServers();
    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    this.receiverPc = pc;
    this.receiverStream = new MediaStream();

    pc.ontrack = (event) => {
      const stream = this.receiverStream;
      if (!stream || stream.getTracks().some((track) => track.id === event.track.id)) return;
      stream.addTrack(event.track);
      this.onRemoteStream(stream);
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendSignal(
        "screen-ice",
        JSON.stringify({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        }),
      );
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.stopRemote();
      }
    };

    const offer = JSON.parse(payload) as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(offer);
    for (const candidate of this.pendingReceiverIce.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => {
        this.pendingReceiverIce.push(candidate);
      });
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignal("screen-answer", JSON.stringify(pc.localDescription));
  }

  private stopRemote(): void {
    this.receiverPc?.close();
    this.receiverPc = null;
    for (const track of this.receiverStream?.getTracks() ?? []) track.stop();
    this.receiverStream = null;
    this.pendingReceiverIce = [];
    this.onRemoteStream(null);
  }

  private parseCandidate(payload: string): RTCIceCandidateInit | null {
    try {
      const parsed = JSON.parse(payload) as RTCIceCandidateInit;
      return parsed.candidate ? parsed : null;
    } catch {
      return null;
    }
  }

  private async removeNativeListener(): Promise<void> {
    await this.nativeListener?.remove().catch(() => {});
    this.nativeListener = null;
  }
}
