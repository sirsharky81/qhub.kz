import { prepareAudioSessionForCall } from "@/lib/audio-session";
import { setCallSpeakerEnabled } from "@/lib/platform/call-audio";
import { isIOSDevice } from "@/lib/platform/device";
import {
  detachInactiveCallMedia,
  getCallMediaElement,
  playCallMedia,
  purgeOrphanedCallMediaElements,
  releaseCallMediaPlayback,
} from "./call-media-playback";
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

export { purgeOrphanedCallMediaElements, releaseCallMediaPlayback };

export class CallPeerConnection {
  private pc: RTCPeerConnection | null = null;
  private audioTransceiver: RTCRtpTransceiver | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteMedia: HTMLMediaElement | null = null;
  private remoteAudioTrack: MediaStreamTrack | null = null;
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
      if (ev.track.kind !== "audio") return;
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.bindRemoteAudioTrack(ev.track, stream);
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

  needsPlaybackRetry(): boolean {
    if (!this.remoteStream) return false;
    if (!this.remoteMedia) return true;
    return this.remoteMedia.paused || this.remoteMedia.ended;
  }

  getPlaybackDebug(): {
    mediaTag: string | null;
    mediaPaused: boolean;
    remoteTrackMuted: boolean;
  } {
    return {
      mediaTag: this.remoteMedia?.tagName ?? null,
      mediaPaused: this.remoteMedia?.paused ?? true,
      remoteTrackMuted: this.remoteAudioTrack?.muted ?? true,
    };
  }

  private bindRemoteAudioTrack(track: MediaStreamTrack, stream: MediaStream): void {
    if (this.remoteAudioTrack && this.remoteAudioTrack !== track) {
      this.remoteAudioTrack.onunmute = null;
      this.remoteAudioTrack.onended = null;
    }
    this.remoteAudioTrack = track;
    this.remoteStream = stream;

    track.onunmute = () => {
      void this.playRemoteAudio();
    };
    track.onended = () => {
      if (this.remoteMedia) {
        this.remoteMedia.srcObject = null;
      }
    };

    this.mountRemoteMedia();
    this.onRemoteTrack?.();
  }

  private mountRemoteMedia(): void {
    if (!this.remoteStream) return;

    const el = getCallMediaElement(this.speakerOn);
    const sameElement =
      this.remoteMedia === el &&
      this.remoteMedia.srcObject === this.remoteStream;
    if (sameElement) return;

    detachInactiveCallMedia(el);
    el.srcObject = this.remoteStream;
    this.remoteMedia = el;
    void this.playRemoteAudio();
  }

  private async applySpeakerRoute(): Promise<void> {
    if (!isIOSDevice()) {
      await setCallSpeakerEnabled(this.speakerOn);
    }
  }

  async playRemoteAudio(): Promise<void> {
    prepareAudioSessionForCall();
    if (!this.remoteStream) return;

    if (!this.remoteMedia?.srcObject) {
      this.mountRemoteMedia();
      return;
    }

    if (await playCallMedia(this.remoteMedia)) {
      await this.applySpeakerRoute();
      return;
    }

    if (isIOSDevice()) {
      for (const delay of [200, 500, 1000, 2000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (await playCallMedia(this.remoteMedia!)) {
          await this.applySpeakerRoute();
          return;
        }
      }
    }
  }

  setSpeakerphone(enabled: boolean): void {
    const changed = this.speakerOn !== enabled;
    this.speakerOn = enabled;
    prepareAudioSessionForCall();
    if (!this.remoteStream || !changed) return;
    this.mountRemoteMedia();
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

    if (this.remoteAudioTrack) {
      this.remoteAudioTrack.onunmute = null;
      this.remoteAudioTrack.onended = null;
      this.remoteAudioTrack = null;
    }

    if (this.remoteMedia) {
      this.remoteMedia.srcObject = null;
      this.remoteMedia = null;
    }

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
