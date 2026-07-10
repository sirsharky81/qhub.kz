"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prepareAudioSessionForCall } from "@/lib/audio-session";
import { getCallController } from "@/lib/messenger/call/call-controller";
import { primeCallMediaPlayback } from "@/lib/messenger/call/call-media-playback";
import { prefetchIceServers } from "@/lib/messenger/call/signaling-client";
import { canUseNativeScreenShare } from "@/lib/messenger/call/call-screen-share";
import type { CallState } from "@/lib/messenger/call/types";
import { ActiveCallScreen } from "./ActiveCallScreen";
import { IncomingCallOverlay } from "./IncomingCallOverlay";

interface CallContextValue {
  state: CallState;
  startAudioCall: () => void;
  startVideoCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleSpeaker: () => void;
  isInCall: boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall must be used within CallProvider");
  }
  return ctx;
}

export function useCallOptional(): CallContextValue | null {
  return useContext(CallContext);
}

interface Props {
  myPhone: string;
  peerPhone: string;
  channel: string;
  peerTitle: string;
  peerAvatarUrl?: string | null;
  deepLinkCallId?: string | null;
  children: ReactNode;
}

export function CallProvider({
  myPhone,
  peerPhone,
  channel,
  peerTitle,
  peerAvatarUrl,
  deepLinkCallId,
  children,
}: Props) {
  const controllerRef = useRef(getCallController());
  const [state, setState] = useState<CallState>(controllerRef.current.getState());
  const [localStream, setLocalStream] = useState<MediaStream | null>(controllerRef.current.getLocalStream());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(controllerRef.current.getRemoteStream());
  const [screenStream, setScreenStream] = useState<MediaStream | null>(
    controllerRef.current.getRemoteScreenStream(),
  );
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    const controller = controllerRef.current;
    controller.configure({ myPhone, peerPhone, channel });
    // Warm TURN credentials while the user is reading the chat. Starting this
    // only on the call-button gesture leaves a cold third-party request on the
    // critical path, which can add several seconds to iPhone video calls.
    prefetchIceServers();
    // Incoming discovery is owned by MessengerGlobalCallWatcher to avoid
    // dual polling races (/call/incoming + per-channel /call/poll).
    const unsubState = controller.subscribe(setState);
    const unsubMedia = controller.subscribeMedia((media) => {
      setLocalStream(media.localStream);
      setRemoteStream(media.remoteStream);
      setScreenStream(media.screenStream);
    });
    return () => {
      unsubState();
      unsubMedia();
    };
  }, [myPhone, peerPhone, channel]);

  useEffect(() => {
    if (!deepLinkCallId || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    void controllerRef.current.handleDeepLink(deepLinkCallId, { channel, peerPhone });
  }, [deepLinkCallId]);

  useEffect(() => {
    return () => {
      const controller = controllerRef.current;
      if (controller.isInCall()) {
        void controller.hangup();
      }
    };
  }, []);

  const startAudioCall = useCallback(() => {
    primeCallMediaPlayback(false);
    controllerRef.current.beginLocalMediaCapture({ video: false, speakerOn: false });
    void controllerRef.current.startOutgoing({ video: false });
  }, []);

  const startVideoCall = useCallback(() => {
    primeCallMediaPlayback(true);
    prepareAudioSessionForCall();
    controllerRef.current.beginLocalMediaCapture({ video: true, speakerOn: true });
    void controllerRef.current.startOutgoing({ video: true });
  }, []);

  const acceptCall = useCallback(() => {
    const video = state.callMode === "video";
    primeCallMediaPlayback(video);
    if (video) {
      prepareAudioSessionForCall();
    }
    controllerRef.current.beginLocalMediaCapture({
      video,
      speakerOn: video,
    });
    void controllerRef.current.acceptIncoming();
  }, [state.callMode]);

  const rejectCall = useCallback(() => {
    void controllerRef.current.rejectIncoming();
  }, []);

  const hangup = useCallback(() => {
    void controllerRef.current.hangup();
  }, []);

  const toggleMute = useCallback(() => {
    controllerRef.current.setMuted(!state.muted);
  }, [state.muted]);

  const toggleVideo = useCallback(() => {
    void controllerRef.current.setVideoEnabled(!state.videoEnabled);
  }, [state.videoEnabled]);

  const switchCamera = useCallback(() => {
    return controllerRef.current.switchCamera();
  }, []);

  const toggleScreenShare = useCallback(() => {
    return controllerRef.current.toggleScreenShare();
  }, []);

  const toggleSpeaker = useCallback(() => {
    const nextSpeakerOn = !state.speakerOn;
    primeCallMediaPlayback(nextSpeakerOn);
    controllerRef.current.setSpeaker(nextSpeakerOn);
  }, [state.speakerOn]);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startAudioCall,
      startVideoCall,
      acceptCall,
      rejectCall,
      hangup,
      toggleMute,
      toggleVideo,
      switchCamera,
      toggleScreenShare,
      toggleSpeaker,
      isInCall: state.phase !== "idle" && state.phase !== "ended",
    }),
    [state, startAudioCall, startVideoCall, acceptCall, rejectCall, hangup, toggleMute, toggleVideo, switchCamera, toggleScreenShare, toggleSpeaker],
  );

  const showIncoming = state.phase === "incoming";
  const showCallScreen =
    state.phase === "outgoing" ||
    state.phase === "connecting" ||
    state.phase === "active" ||
    (state.phase === "ended" && state.errorMessage);

  return (
    <CallContext.Provider value={value}>
      {children}
      {showIncoming && (
        <IncomingCallOverlay
          peerTitle={peerTitle}
          peerAvatarUrl={peerAvatarUrl}
          onAccept={acceptCall}
          onDecline={rejectCall}
        />
      )}
      {showCallScreen && (
        <ActiveCallScreen
          peerTitle={peerTitle}
          peerAvatarUrl={peerAvatarUrl}
          phase={state.phase}
          callMode={state.callMode}
          durationSec={state.durationSec}
          muted={state.muted}
          videoEnabled={state.videoEnabled}
          speakerOn={state.speakerOn}
          errorMessage={state.errorMessage}
          debug={state.debug}
          localStream={localStream}
          remoteStream={remoteStream}
          screenStream={screenStream}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onSwitchCamera={switchCamera}
          canShareScreen={canUseNativeScreenShare()}
          screenSharing={state.screenSharing}
          onToggleScreenShare={toggleScreenShare}
          onToggleSpeaker={toggleSpeaker}
          onHangup={hangup}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCallButtonProps(peerOnline: boolean | null) {
  const { startAudioCall, startVideoCall, isInCall } = useCall();
  const disabled = peerOnline === false;
  const disabledReason = "Собеседник не в сети";
  return {
    disabled,
    disabledReason,
    inCall: isInCall,
    onAudioCall: startAudioCall,
    onVideoCall: startVideoCall,
  };
}
