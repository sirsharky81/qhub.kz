import type { RTCIceServer } from "./types";

export type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export class CallPeerConnection {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private iceServers: RTCIceServer[] = [];
  private onIceCandidate: ((candidate: IceCandidatePayload) => void) | null = null;
  private onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;
  private iceBatch: IceCandidatePayload[] = [];
  private iceBatchTimer: ReturnType<typeof setTimeout> | null = null;

  async init(iceServers: RTCIceServer[]): Promise<void> {
    this.iceServers = iceServers;
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.onIceCandidate) return;
      const payload: IceCandidatePayload = {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      };
      this.iceBatch.push(payload);
      if (!this.iceBatchTimer) {
        this.iceBatchTimer = setTimeout(() => this.flushIceBatch(), 50);
      }
    };
    this.pc.ontrack = (ev) => {
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
      }
      this.remoteAudio.srcObject = ev.streams[0] ?? null;
      void this.remoteAudio.play().catch(() => {});
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.onConnectionState) {
        this.onConnectionState(this.pc.connectionState);
      }
    };
  }

  private flushIceBatch(): void {
    this.iceBatchTimer = null;
    if (!this.onIceCandidate || this.iceBatch.length === 0) return;
    const batch = this.iceBatch.splice(0);
    for (const c of batch) {
      this.onIceCandidate(c);
    }
  }

  setHandlers(handlers: {
    onIceCandidate?: (candidate: IceCandidatePayload) => void;
    onConnectionState?: (state: RTCPeerConnectionState) => void;
  }): void {
    this.onIceCandidate = handlers.onIceCandidate ?? null;
    this.onConnectionState = handlers.onConnectionState ?? null;
  }

  async attachLocalAudio(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    if (!this.pc) return;
    for (const track of stream.getAudioTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  async createOffer(): Promise<string> {
    if (!this.pc) throw new Error("no_pc");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return JSON.stringify(this.pc.localDescription);
  }

  async createAnswer(remoteOfferSdp: string): Promise<string> {
    if (!this.pc) throw new Error("no_pc");
    const offer = JSON.parse(remoteOfferSdp) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return JSON.stringify(this.pc.localDescription);
  }

  async applyAnswer(remoteAnswerSdp: string): Promise<void> {
    if (!this.pc) throw new Error("no_pc");
    const answer = JSON.parse(remoteAnswerSdp) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(answer);
  }

  async addIceCandidate(payload: string): Promise<void> {
    if (!this.pc) return;
    const data = JSON.parse(payload) as IceCandidatePayload;
    if (!data.candidate) return;
    await this.pc.addIceCandidate({
      candidate: data.candidate,
      sdpMid: data.sdpMid ?? undefined,
      sdpMLineIndex: data.sdpMLineIndex ?? undefined,
    });
  }

  setMuted(muted: boolean): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  close(): void {
    if (this.iceBatchTimer) {
      clearTimeout(this.iceBatchTimer);
      this.iceBatchTimer = null;
    }
    this.iceBatch = [];
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    for (const track of this.localStream?.getTracks() ?? []) {
      track.stop();
    }
    this.localStream = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
