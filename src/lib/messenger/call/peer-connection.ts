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
  private remoteSyncTimers: ReturnType<typeof setTimeout>[] = [];

  async init(iceServers: RTCIceServer[]): Promise<void> {
    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

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
      if (!this.pc) return;
      if (this.pc.connectionState === "connected") {
        this.syncRemoteAudioFromPeer();
      }
      this.onConnectionState?.(this.pc.connectionState);
    };
    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        this.syncRemoteAudioFromPeer();
      }
      this.onIceConnectionState?.(state);
    };
  }

  hasRemoteDescription(): boolean {
    return this.remoteDescriptionSet;
  }

  needsPlaybackRetry(): boolean {
    if (!this.remoteStream) return true;
    if (!this.remoteMedia) return true;
    return this.remoteMedia.paused || this.remoteMedia.ended;
  }

  getPlaybackDebug(): {
    mediaTag: string | null;
    mediaPaused: boolean;
    remoteTrackMuted: boolean;
    hasRemoteTrack: boolean;
    receiverCount: number;
    speakerOn: boolean;
  } {
    return {
      mediaTag: this.remoteMedia?.tagName ?? null,
      mediaPaused: this.remoteMedia?.paused ?? true,
      remoteTrackMuted: this.remoteAudioTrack?.muted ?? true,
      hasRemoteTrack: Boolean(this.remoteAudioTrack),
      receiverCount: this.pc?.getReceivers().filter((r) => r.track?.kind === "audio").length ?? 0,
      speakerOn: this.speakerOn,
    };
  }

  /** Safari often skips ontrack on the caller — attach from RTCRtpReceiver instead. */
  syncRemoteAudioFromPeer(): boolean {
    if (!this.pc) return false;

    const tracks: MediaStreamTrack[] = [];
    for (const receiver of this.pc.getReceivers()) {
      if (receiver.track?.kind === "audio") {
        tracks.push(receiver.track);
      }
    }
    for (const transceiver of this.pc.getTransceivers()) {
      const track = transceiver.receiver.track;
      if (track?.kind === "audio" && !tracks.includes(track)) {
        tracks.push(track);
      }
    }

    const track = tracks[0];
    if (!track) return false;

    if (this.remoteAudioTrack === track) {
      return true;
    }

    const stream = new MediaStream([track]);
    this.bindRemoteAudioTrack(track, stream);
    return true;
  }

  private scheduleRemoteAudioSync(): void {
    this.clearRemoteSyncTimers();
    const delays = isIOSDevice() ? [0, 100, 300, 600, 1200, 2500, 4000] : [0, 300, 1000];
    for (const delay of delays) {
      const timer = setTimeout(() => {
        if (this.syncRemoteAudioFromPeer()) {
          void this.playRemoteAudio();
        }
      }, delay);
      this.remoteSyncTimers.push(timer);
    }
  }

  private clearRemoteSyncTimers(): void {
    for (const timer of this.remoteSyncTimers) {
      clearTimeout(timer);
    }
    this.remoteSyncTimers = [];
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
      this.remoteAudioTrack = null;
    };

    this.mountRemoteMedia();
    this.onRemoteTrack?.();
  }

  private mountRemoteMedia(): void {
    if (!this.remoteStream) return;

    const el = getCallMediaElement(this.speakerOn);
    detachInactiveCallMedia(el);

    if (this.remoteMedia && this.remoteMedia !== el) {
      this.remoteMedia.srcObject = null;
    }

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
    if (!this.remoteStream) {
      this.syncRemoteAudioFromPeer();
    }
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
    this.speakerOn = enabled;
    prepareAudioSessionForCall();
    if (!this.remoteStream) return;
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

    const audioSender = this.pc.getSenders().find((sender) => sender.track?.kind === "audio");
    if (audioSender) {
      await audioSender.replaceTrack(track);
      return;
    }

    this.pc.addTrack(track, stream);
  }

  async createOffer(): Promise<string> {
    if (!this.pc) throw new Error("no_pc");
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
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
    this.scheduleRemoteAudioSync();
    return JSON.stringify(this.pc.localDescription);
  }

  async applyAnswer(remoteAnswerSdp: string): Promise<void> {
    if (!this.pc) throw new Error("no_pc");
    const answer = JSON.parse(remoteAnswerSdp) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(answer);
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
    this.syncRemoteAudioFromPeer();
    this.scheduleRemoteAudioSync();
    void this.playRemoteAudio();
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
    this.syncRemoteAudioFromPeer();
  }

  setMuted(muted: boolean): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  close(): void {
    this.clearRemoteSyncTimers();
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

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
