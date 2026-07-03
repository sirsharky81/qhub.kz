import { prepareAudioSessionForCall } from "@/lib/audio-session";
import {
  hasNativeCallAudioRouting,
  setCallSpeakerEnabled,
  shouldKeepMediaElementVisible,
} from "@/lib/platform/call-audio";
import { isIOSDevice } from "@/lib/platform/device";
import type { RTCIceServer } from "./types";

export type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

const CALL_MEDIA_ATTR = "data-qhub-call-media";

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

/** iOS WebKit silences off-screen WebRTC remote audio — keep a 1px in-viewport element. */
function hideMediaElement(el: HTMLMediaElement): void {
  const keepVisible = shouldKeepMediaElementVisible();
  Object.assign(el.style, {
    position: "fixed",
    left: keepVisible ? "0" : "-9999px",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: keepVisible ? "0.001" : "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
}

function configureMediaElement(el: HTMLMediaElement): void {
  el.autoplay = true;
  el.muted = false;
  el.volume = 1;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.setAttribute(CALL_MEDIA_ATTR, "true");
  if ("playsInline" in el) {
    (el as HTMLVideoElement).playsInline = true;
  }
  hideMediaElement(el);
}

function playbackMode(): "ios-element" | "native-android" | "default" {
  if (isIOSDevice()) return "ios-element";
  if (hasNativeCallAudioRouting()) return "native-android";
  return "default";
}

/** Remove any call media nodes that outlived peer connection teardown. */
export function purgeOrphanedCallMediaElements(): void {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll(`[${CALL_MEDIA_ATTR}]`)) {
    const media = el as HTMLMediaElement;
    media.pause();
    media.srcObject = null;
    media.remove();
  }
}

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
      this.destroyRemoteMedia();
    };

    this.mountRemoteMedia();
    this.onRemoteTrack?.();
  }

  private destroyRemoteMedia(): void {
    if (this.remoteMedia) {
      this.remoteMedia.muted = true;
      this.remoteMedia.volume = 0;
      this.remoteMedia.pause();
      this.remoteMedia.srcObject = null;
      this.remoteMedia.removeAttribute(CALL_MEDIA_ATTR);
      this.remoteMedia.remove();
      this.remoteMedia = null;
    }
  }

  /** iOS Safari/PWA: loudspeaker via <video>, earpiece via <audio>. */
  private shouldUseVideoElement(): boolean {
    return playbackMode() === "ios-element" && this.speakerOn;
  }

  private mountDirectMediaElement(useVideo: boolean): void {
    if (!this.remoteStream) return;

    const el = document.createElement(useVideo ? "video" : "audio");
    configureMediaElement(el);
    document.body.appendChild(el);
    el.srcObject = this.remoteStream;
    this.remoteMedia = el;
  }

  private mountRemoteMedia(): void {
    if (!this.remoteStream) return;

    const useVideo = this.shouldUseVideoElement();
    const currentIsVideo = this.remoteMedia?.tagName === "VIDEO";
    if (this.remoteMedia?.srcObject === this.remoteStream && currentIsVideo === useVideo) {
      return;
    }

    const previous = this.remoteMedia;
    this.remoteMedia = null;
    this.mountDirectMediaElement(useVideo);
    void this.playRemoteAudio().then(() => {
      if (previous && previous !== this.remoteMedia) {
        previous.muted = true;
        previous.volume = 0;
        previous.pause();
        previous.srcObject = null;
        previous.remove();
      }
    });
  }

  private async applySpeakerRoute(): Promise<void> {
    if (playbackMode() === "native-android") {
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

    const tryElementPlay = async (): Promise<boolean> => {
      if (!this.remoteMedia?.srcObject) return false;
      try {
        this.remoteMedia.muted = false;
        this.remoteMedia.volume = 1;
        await this.remoteMedia.play();
        return !this.remoteMedia.paused && !this.remoteMedia.ended;
      } catch {
        return false;
      }
    };

    if (await tryElementPlay()) {
      await this.applySpeakerRoute();
      return;
    }

    if (isIOSDevice()) {
      for (const delay of [200, 500, 1000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (await tryElementPlay()) {
          await this.applySpeakerRoute();
          return;
        }
      }
    }
  }

  setSpeakerphone(enabled: boolean): void {
    const elementSwapNeeded = playbackMode() === "ios-element" && this.speakerOn !== enabled;
    this.speakerOn = enabled;
    prepareAudioSessionForCall();

    if (!this.remoteStream) return;

    if (elementSwapNeeded) {
      this.mountRemoteMedia();
      return;
    }

    void this.applySpeakerRoute().then(() => this.playRemoteAudio());
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

    this.destroyRemoteMedia();
    purgeOrphanedCallMediaElements();

    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        track.stop();
      }
      this.remoteStream = null;
    }

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
