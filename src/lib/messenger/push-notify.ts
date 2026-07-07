import { dispatchPushNotifications } from "@/lib/push/dispatch";
import { messengerChatCallUrl, messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import { MAX_PUSH_PREVIEW_LENGTH } from "./constants";
import { displayNameForPhone, getProfile, loadProfiles } from "./store";
import type { MessageType } from "./types";
import {
  getMessengerPresence,
  getMessengerPushSubscriptions,
  isViewingChannel,
} from "./push-store";
import { normalizeKzPhone } from "./phone";

const MESSENGER_ICON = "/tools/messenger/icon-192.png";

function messagePreview(type: MessageType, previewText?: string): string {
  const trimmed = previewText?.replace(/\s+/g, " ").trim();
  if (trimmed) return trimmed.slice(0, MAX_PUSH_PREVIEW_LENGTH);
  if (type === "image") return "Фото";
  if (type === "audio") return "Голосовое сообщение";
  if (type === "video") return "Видео";
  if (type === "file") return "Файл";
  return "Сообщение";
}

export function sanitizePushPreview(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_PUSH_PREVIEW_LENGTH);
}

function peersFromDmChannel(channel: string): string[] {
  if (!channel.startsWith("dm:")) return [];
  const parts = channel.split(":");
  if (parts.length < 3) return [];
  return [normalizeKzPhone(parts[1]), normalizeKzPhone(parts[2])];
}

async function senderLabel(fromPhone: string): Promise<string> {
  const profiles = await loadProfiles();
  const name = displayNameForPhone(fromPhone, profiles);
  if (name !== fromPhone) return name;
  const profile = await getProfile(fromPhone);
  const display = profile?.displayName?.trim();
  return display || fromPhone;
}

async function pushToPhone(
  recipientPhone: string,
  channel: string,
  payload: { title: string; body: string; url: string; action?: "messenger:message" | "messenger:call" },
): Promise<void> {
  const presence = await getMessengerPresence(recipientPhone);
  // #region agent log
  fetch('http://127.0.0.1:7377/ingest/122138cd-66a6-4400-a055-756aebd5d29d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'480e62'},body:JSON.stringify({sessionId:'480e62',runId:'pre-fix',hypothesisId:'H6',location:'push-notify.ts:pushToPhone',message:'Evaluating push suppression',data:{hasPresence:Boolean(presence),sameChannel:isViewingChannel(presence,channel),presenceAgeMs:presence?Date.now()-presence.at:null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (presence && isViewingChannel(presence, channel)) {
    return;
  }

  const subs = await getMessengerPushSubscriptions(recipientPhone);
  if (subs.length === 0) return;

  await dispatchPushNotifications(subs, {
    ...payload,
    icon: MESSENGER_ICON,
    badge: MESSENGER_ICON,
    action: payload.action ?? "messenger:message",
  });
}

export async function notifyDmMessage(params: {
  channel: string;
  fromPhone: string;
  type: MessageType;
  pushPreview?: string;
}): Promise<void> {
  const peers = peersFromDmChannel(params.channel);
  const recipient = peers.find((p) => p !== normalizeKzPhone(params.fromPhone));
  if (!recipient) return;

  const label = await senderLabel(params.fromPhone);
  const preview = messagePreview(params.type, params.pushPreview);
  const chatUrl = messengerChatUrl(params.fromPhone);

  await pushToPhone(recipient, params.channel, {
    title: label,
    body: preview,
    url: chatUrl,
    action: "messenger:message",
  });
}

export async function notifyRoomMessage(params: {
  roomId: string;
  channel: string;
  fromPhone: string;
  type: MessageType;
  recipientPhones: string[];
  pushPreview?: string;
}): Promise<void> {
  const label = await senderLabel(params.fromPhone);
  const preview = messagePreview(params.type, params.pushPreview);
  const url = messengerRoomUrl(params.roomId);

  await Promise.allSettled(
    params.recipientPhones.map((phone) =>
      pushToPhone(phone, params.channel, {
        title: label,
        body: preview,
        url,
        action: "messenger:message",
      }),
    ),
  );
}

export async function notifyIncomingCall(params: {
  channel: string;
  callId: string;
  callerPhone: string;
  calleePhone: string;
  media: "audio" | "video";
}): Promise<void> {
  const label = await senderLabel(params.callerPhone);
  const chatUrl = messengerChatCallUrl(params.callerPhone, params.callId);
  const body =
    params.media === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок";

  const presence = await getMessengerPresence(params.calleePhone);
  if (isViewingChannel(presence, params.channel)) return;

  const subs = await getMessengerPushSubscriptions(params.calleePhone);
  if (subs.length === 0) return;

  await dispatchPushNotifications(subs, {
    title: label,
    body,
    url: chatUrl,
    icon: MESSENGER_ICON,
    badge: MESSENGER_ICON,
    action: "messenger:call",
    callId: params.callId,
    callMedia: params.media,
  });
}
