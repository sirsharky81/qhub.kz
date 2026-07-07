import { normalizeKzPhone } from "../phone";
import { redisPublish } from "@/lib/redis/commands";
import type { CallSignal, CallSession, ChannelEnvelope } from "../types";
import { realtimeUserChannel, type RealtimeServerEvent } from "./protocol";

async function publishToPhones(phones: string[], event: RealtimeServerEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const unique = [...new Set(phones.map((p) => normalizeKzPhone(p)).filter(Boolean))];
  await Promise.all(unique.map((phone) => redisPublish(realtimeUserChannel(phone), payload)));
}

export async function dmChannelParticipants(channel: string): Promise<string[]> {
  if (!channel.startsWith("dm:")) return [];
  const parts = channel.split(":");
  if (parts.length !== 3) return [];
  return [normalizeKzPhone(parts[1]), normalizeKzPhone(parts[2])].filter(Boolean);
}

export async function channelParticipants(channel: string): Promise<string[]> {
  if (channel.startsWith("dm:")) {
    return dmChannelParticipants(channel);
  }
  if (channel.startsWith("room:")) {
    const roomId = channel.slice(5);
    const { getRoomParticipants } = await import("../store");
    const participants = await getRoomParticipants(roomId);
    return participants.map((p) => normalizeKzPhone(p.phone)).filter(Boolean);
  }
  return [];
}

export async function publishEnvelopesEvent(params: {
  channel: string;
  version: number;
  envelopes: ChannelEnvelope[];
  excludePhone?: string;
}): Promise<void> {
  const recipients = await channelParticipants(params.channel);
  const filtered = params.excludePhone
    ? recipients.filter((p) => p !== normalizeKzPhone(params.excludePhone!))
    : recipients;
  if (!filtered.length) return;
  await publishToPhones(filtered, {
    type: "envelopes",
    channel: params.channel,
    version: params.version,
    envelopes: params.envelopes,
  });
}

export async function publishCallSignalEvent(params: {
  session: CallSession;
  signals: CallSignal[];
}): Promise<void> {
  const recipients = [params.session.caller, params.session.callee];
  await publishToPhones(recipients, {
    type: "call_signal",
    callId: params.session.callId,
    session: params.session,
    signals: params.signals,
  });
}

export async function publishIncomingCallEvent(params: {
  callId: string;
  channel: string;
  callerPhone: string;
  calleePhone: string;
  media: "audio" | "video";
}): Promise<void> {
  await publishToPhones([params.calleePhone], {
    type: "incoming_call",
    callId: params.callId,
    channel: params.channel,
    callerPhone: params.callerPhone,
    media: params.media,
  });
}

export async function publishTypingEvent(params: {
  channel: string;
  peerPhone: string;
  active: boolean;
  excludePhone?: string;
}): Promise<void> {
  const recipients = await channelParticipants(params.channel);
  const filtered = params.excludePhone
    ? recipients.filter((p) => p !== normalizeKzPhone(params.excludePhone!))
    : recipients;
  if (!filtered.length) return;
  await publishToPhones(filtered, {
    type: "typing",
    channel: params.channel,
    peerPhone: params.peerPhone,
    active: params.active,
  });
}

export async function publishPeerOnlineEvent(params: {
  phone: string;
  online: boolean;
  activeChannel?: string;
  notifyPhones: string[];
}): Promise<void> {
  const filtered = params.notifyPhones
    .map((p) => normalizeKzPhone(p))
    .filter((p) => p && p !== normalizeKzPhone(params.phone));
  if (!filtered.length) return;
  await publishToPhones(filtered, {
    type: "peer_online",
    phone: params.phone,
    online: params.online,
    activeChannel: params.activeChannel,
  });
}

export async function publishDialogUpdateEvent(phone: string): Promise<void> {
  await publishToPhones([phone], { type: "dialog_update", phone });
}
