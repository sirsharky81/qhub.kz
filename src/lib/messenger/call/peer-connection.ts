import type { RTCIceServer } from "./types";

export type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

function parseIcePayload(payload: string): RTCIceCandidateInit | null {
  try {
    const data = JSON.parse(payload) as IceCandidatePayload;
    if (!data.candidate) return null;
    return {
      candidate: data.candidate,
      sdpMid: data.sdpMid ?? undefined,
      sdpMLineIndex: data.sdpMLineIndex ?? undefined,
    };
  } catch {
    return null;
  }
}

function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export class CallPeerConnection {
  private pc: RTCPeerConnection | null = null;
  private audioTransceiver: RTCRtpTransceiver | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteMedia: HTMLMediaElement | null = null;
  private speakerOn = true;
  private onIceCandidate: ((candidate: IceCandidatePayload) => void) | null = null;
  private onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;
  private onIceConnectionState: ((state: RTCIceConnectionState) => void) | null = null;
  private onRemoteTrack: (() => void) | null = null;
  private remoteDescriptionSet = false;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];

  async init(iceServers: RTCIceServer[]): Promise<void> {
    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    this.audioTransceiver = this.pc.addTransceiver("audio", { direction: "sendrecv" });

    this.pc.onicecandidate = (ev) => {
      if (!this.onIceCandidate) return;
      if (!ev.candidate) {
        this.onIceCandidate({});
        return;
      }
      this.onIceCandidate({
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      });
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.attachRemoteStream(stream);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.onConnectionState) {
        this.onConnectionState(this.pc.connectionState);
      }
    };
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc && this.onIceConnectionState) {
        this.onIceConnectionState(this.pc.iceConnectionState);
      }
    };
  }

  hasRemoteDescription(): boolean {
    return this.remoteDescriptionSet;
  }

  private attachRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
    this.mountRemoteMedia();
    this.onRemoteTrack?.();
  }

  private destroyRemoteMedia(): void {
    if (!this.remoteMedia) return;
    this.remoteMedia.pause();
    this.remoteMedia.srcObject = null;
    this.remoteMedia.remove();
    this.remoteMedia = null;
  }

  private mountRemoteMedia(): void {
    if (!this.remoteStream) return;
    this.destroyRemoteMedia();

    const useVideo = isIosWebKit() ? this.speakerOn : false;
    const el = document.createElement(useVideo ? "video" : "audio");
    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.muted = false;
    el.volume = 1;
    el.style.display = "none";
    document.body.appendChild(el);
    el.srcObject = this.remoteStream;
    this.remoteMedia = el;
    void this.playRemoteAudio();
  }

  async playRemoteAudio(): Promise<void> {
    if (!this.remoteMedia?.srcObject) return;
    try {
      this.remoteMedia.muted = false;
      this.remoteMedia.volume = 1;
      await this.remoteMedia.play();
    } catch {
      // Retried when call becomes active or user toggles speaker.
    }
  }

  setSpeakerphone(enabled: boolean): void {
    this.speakerOn = enabled;
    if (this.remoteStream) {
      this.mountRemoteMedia();
    }
  }

  setHandlers(handlers: {
    onIceCandidate?: (candidate: IceCandidatePayload) => void;
    onConnectionState?: (state: RTCPeerConnectionState) => void;
    onIceConnectionState?: (state: RTCIceConnectionState) => void;
    onRemoteTrack?: () => void;
  }): void {
    this.onIceCandidate = handlers.onIceCandidate ?? null;
    this.onConnectionState = handlers.onConnectionState ?? null;
    this.onIceConnectionState = handlers.onIceConnectionState ?? null;
    this.onRemoteTrack = handlers.onRemoteTrack ?? null;
  }

  async attachLocalAudio(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const track = stream.getAudioTracks()[0];
    if (!this.pc || !track) return;

    if (this.audioTransceiver?.sender) {
      await this.audioTransceiver.sender.replaceTrack(track);
      return;
    }

    this.pc.addTrack(track, stream);
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
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return JSON.stringify(this.pc.localDescription);
  }

  async applyAnswer(remoteAnswerSdp: string): Promise<void> {
    if (!this.pc) throw new Error("no_pc");
    const answer = JSON.parse(remoteAnswerSdp) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(answer);
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
  }

  async addIceCandidate(payload: string): Promise<void> {
    const candidate = parseIcePayload(payload);
    if (!candidate || !this.pc) return;

    if (!this.remoteDescriptionSet) {
      this.pendingRemoteCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      this.pendingRemoteCandidates.push(candidate);
    }
  }

  async flushPendingRemoteCandidates(): Promise<void> {
    if (!this.pc || !this.remoteDescriptionSet) return;

    const remaining: RTCIceCandidateInit[] = [];
    for (const candidate of this.pendingRemoteCandidates) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        remaining.push(candidate);
      }
    }
    this.pendingRemoteCandidates = remaining;
  }

  setMuted(muted: boolean): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  close(): void {
    this.pendingRemoteCandidates = [];
    this.remoteDescriptionSet = false;
    this.destroyRemoteMedia();
    this.remoteStream = null;
    for (const track of this.localStream?.getTracks() ?? []) {
      track.stop();
    }
    this.localStream = null;
    this.audioTransceiver = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
