export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type CallPhase =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended";

export type CallEndReason =
  | "hangup"
  | "reject"
  | "busy"
  | "timeout"
  | "error"
  | "remote_end"
  | null;

export interface CallDebugInfo {
  isCaller: boolean;
  turnSource: "metered" | "static" | "fallback" | null;
  iceConnectionState: string | null;
  connectionState: string | null;
  hasRemoteDescription: boolean;
  hasLocalOffer: boolean;
  hasLocalAnswer: boolean;
  hasSessionOffer: boolean;
  hasSessionAnswer: boolean;
  lastError: string | null;
  pollCount: number;
  elapsedSec: number;
}

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  channel: string | null;
  peerPhone: string | null;
  muted: boolean;
  speakerOn: boolean;
  durationSec: number;
  errorMessage: string | null;
  endReason: CallEndReason;
  debug: CallDebugInfo;
}

export interface CallPollResponse {
  session: {
    callId: string;
    channel: string;
    caller: string;
    callee: string;
    status: string;
    version: number;
    createdAt: number;
    endedAt?: number;
    endReason?: string;
    offerSdp?: string;
    answerSdp?: string;
  };
  signals: Array<{
    id: string;
    type: string;
    from: string;
    ts: number;
    seq: number;
    payload?: string;
  }>;
}

export interface InitiateCallResponse {
  ok: boolean;
  callId?: string;
  error?: string;
}
