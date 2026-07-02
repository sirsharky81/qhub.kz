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
import { getCallController } from "@/lib/messenger/call/call-controller";
import type { CallState } from "@/lib/messenger/call/types";
import { ActiveCallScreen } from "./ActiveCallScreen";
import { IncomingCallOverlay } from "./IncomingCallOverlay";

interface CallContextValue {
  state: CallState;
  startCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
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
  deepLinkCallId?: string | null;
  children: ReactNode;
}

export function CallProvider({
  myPhone,
  peerPhone,
  channel,
  peerTitle,
  deepLinkCallId,
  children,
}: Props) {
  const controllerRef = useRef(getCallController());
  const [state, setState] = useState<CallState>(controllerRef.current.getState());
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    const controller = controllerRef.current;
    controller.configure({ myPhone, peerPhone, channel });
    controller.startIncomingWatch();
    return controller.subscribe(setState);
  }, [myPhone, peerPhone, channel]);

  useEffect(() => {
    if (!deepLinkCallId || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    void controllerRef.current.handleDeepLink(deepLinkCallId, { channel, peerPhone });
  }, [deepLinkCallId]);

  useEffect(() => {
    const onHide = () => {
      if (controllerRef.current.isInCall()) {
        void controllerRef.current.hangup();
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      const controller = controllerRef.current;
      if (controller.isInCall()) {
        void controller.hangup();
      }
      controller.stopIncomingWatch();
    };
  }, []);

  const startCall = useCallback(() => {
    void controllerRef.current.startOutgoing();
  }, []);

  const acceptCall = useCallback(() => {
    void controllerRef.current.acceptIncoming();
  }, []);

  const rejectCall = useCallback(() => {
    void controllerRef.current.rejectIncoming();
  }, []);

  const hangup = useCallback(() => {
    void controllerRef.current.hangup();
  }, []);

  const toggleMute = useCallback(() => {
    controllerRef.current.setMuted(!state.muted);
  }, [state.muted]);

  const toggleSpeaker = useCallback(() => {
    controllerRef.current.setSpeaker(!state.speakerOn);
  }, [state.speakerOn]);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startCall,
      acceptCall,
      rejectCall,
      hangup,
      toggleMute,
      toggleSpeaker,
      isInCall: state.phase !== "idle" && state.phase !== "ended",
    }),
    [state, startCall, acceptCall, rejectCall, hangup, toggleMute, toggleSpeaker],
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
          onAccept={acceptCall}
          onDecline={rejectCall}
        />
      )}
      {showCallScreen && (
        <ActiveCallScreen
          peerTitle={peerTitle}
          phase={state.phase}
          durationSec={state.durationSec}
          muted={state.muted}
          speakerOn={state.speakerOn}
          errorMessage={state.errorMessage}
          debug={state.debug}
          onToggleMute={toggleMute}
          onToggleSpeaker={toggleSpeaker}
          onHangup={hangup}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCallButtonProps(peerOnline: boolean | null) {
  const { startCall, isInCall } = useCall();
  const disabled = peerOnline === false;
  const disabledReason = "Собеседник не в сети";
  return {
    disabled,
    disabledReason,
    inCall: isInCall,
    onCall: startCall,
  };
}
