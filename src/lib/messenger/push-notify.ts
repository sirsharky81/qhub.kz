import { dispatchPushNotifications } from "@/lib/push/dispatch";
import { messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import { displayNameForPhone, getProfile, loadProfiles } from "./store";
import type { MessageType } from "./types";
import {
  getMessengerPresence,
  getMessengerPushSubscriptions,
  isViewingChannel,
} from "./push-store";
import { normalizeKzPhone } from "./phone";

const MESSENGER_ICON = "/tools/messenger/icon-192.png";

function messagePreview(type: MessageType): string {
  if (type === "image") return "Фото";
  if (type === "audio") return "Голосовое сообщение";
  if (type === "video") return "Видео";
  if (type === "file") return "Файл";
  return "Сообщение";
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
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const presence = await getMessengerPresence(recipientPhone);
  if (isViewingChannel(presence, channel)) return;

  const subs = await getMessengerPushSubscriptions(recipientPhone);
  if (subs.length === 0) return;

  await dispatchPushNotifications(subs, {
    ...payload,
    icon: MESSENGER_ICON,
    badge: MESSENGER_ICON,
  });
}

export async function notifyDmMessage(params: {
  channel: string;
  fromPhone: string;
  type: MessageType;
}): Promise<void> {
  const peers = peersFromDmChannel(params.channel);
  const recipient = peers.find((p) => p !== normalizeKzPhone(params.fromPhone));
  if (!recipient) return;

  const label = await senderLabel(params.fromPhone);
  const preview = messagePreview(params.type);
  const chatUrl = messengerChatUrl(params.fromPhone);

  await pushToPhone(recipient, params.channel, {
    title: label,
    body: preview,
    url: chatUrl,
  });
}

export async function notifyRoomMessage(params: {
  roomId: string;
  channel: string;
  fromPhone: string;
  type: MessageType;
  recipientPhones: string[];
}): Promise<void> {
  const label = await senderLabel(params.fromPhone);
  const preview = messagePreview(params.type);
  const url = messengerRoomUrl(params.roomId);

  await Promise.allSettled(
    params.recipientPhones.map((phone) =>
      pushToPhone(phone, params.channel, {
        title: label,
        body: preview,
        url,
      }),
    ),
  );
}
