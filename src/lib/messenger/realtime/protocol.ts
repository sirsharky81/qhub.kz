import type { CallSignal, CallSession, ChannelEnvelope } from "../types";

export const REALTIME_REDIS_USER_PREFIX = "qhub:realtime:user:";

export type RealtimeServerEvent =
  | {
      type: "envelopes";
      channel: string;
      version: number;
      envelopes: ChannelEnvelope[];
    }
  | {
      type: "call_signal";
      callId: string;
      session: CallSession;
      signals: CallSignal[];
    }
  | {
      type: "incoming_call";
      callId: string;
      channel: string;
      callerPhone: string;
      media: "audio" | "video";
    }
  | {
      type: "typing";
      channel: string;
      peerPhone: string;
      active: boolean;
    }
  | {
      type: "peer_online";
      phone: string;
      online: boolean;
      activeChannel?: string;
    }
  | {
      type: "dialog_update";
      phone: string;
    }
  | { type: "connected"; phone: string }
  | { type: "error"; message: string };

export type RealtimeClientOp =
  | { op: "auth"; token?: string }
  | { op: "subscribe"; channels: string[] }
  | { op: "unsubscribe"; channels: string[] }
  | { op: "typing"; channel: string; active: boolean }
  | { op: "presence"; channel: string }
  | { op: "pong" };

export function realtimeUserChannel(phone: string): string {
  return `${REALTIME_REDIS_USER_PREFIX}${phone}`;
}
