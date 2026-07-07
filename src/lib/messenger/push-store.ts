import {
  MESSENGER_GLOBAL_PRESENCE_CHANNEL,
  MESSENGER_PRESENCE_TTL_SEC,
  MESSENGER_PUSH_TTL_SEC,
  REDIS_MESSENGER_PRESENCE_PREFIX,
  REDIS_MESSENGER_PUSH_PREFIX,
  REDIS_MESSENGER_TYPING_PREFIX,
  MESSENGER_TYPING_TTL_SEC,
} from "./constants";
import { redisDel, redisGet, redisGetJson, redisSet } from "./redis";
import type { MessengerPresence, MessengerPushSubscription } from "./types";
import {
  channelParticipants,
  publishPeerOnlineEvent,
  publishTypingEvent,
} from "./realtime/publish";

const PRESENCE_WRITE_MIN_INTERVAL_MS = 5000;
const lastPresenceWriteByPhone = new Map<string, { at: number; channel: string }>();

function pushKey(phone: string): string {
  return `${REDIS_MESSENGER_PUSH_PREFIX}${phone}`;
}

function presenceKey(phone: string): string {
  return `${REDIS_MESSENGER_PRESENCE_PREFIX}${phone}`;
}

function typingKey(channel: string, phone: string): string {
  return `${REDIS_MESSENGER_TYPING_PREFIX}${channel}:${phone}`;
}

export async function getMessengerPushSubscriptions(
  phone: string,
): Promise<MessengerPushSubscription[]> {
  return (await redisGetJson<MessengerPushSubscription[]>(pushKey(phone))) ?? [];
}

export async function saveMessengerPushSubscriptions(
  phone: string,
  subscriptions: MessengerPushSubscription[],
): Promise<void> {
  await redisSet(pushKey(phone), JSON.stringify(subscriptions), MESSENGER_PUSH_TTL_SEC);
}

export async function setMessengerPresence(phone: string, channel: string): Promise<void> {
  const now = Date.now();
  const cached = lastPresenceWriteByPhone.get(phone);
  if (
    cached &&
    cached.channel === channel &&
    now - cached.at < PRESENCE_WRITE_MIN_INTERVAL_MS
  ) {
    return;
  }
  const presence: MessengerPresence = { channel, at: Date.now() };
  await redisSet(presenceKey(phone), JSON.stringify(presence), MESSENGER_PRESENCE_TTL_SEC);
  lastPresenceWriteByPhone.set(phone, { at: now, channel });
  void channelParticipants(channel)
    .then((peers) =>
      publishPeerOnlineEvent({
        phone,
        online: true,
        activeChannel: channel,
        notifyPhones: peers,
      }),
    )
    .catch(() => {});
}

export async function touchMessengerPresence(phone: string): Promise<void> {
  const existing = await getMessengerPresence(phone);
  const channel = existing?.channel ?? MESSENGER_GLOBAL_PRESENCE_CHANNEL;
  await setMessengerPresence(phone, channel);
}

export async function setMessengerGlobalPresence(phone: string): Promise<void> {
  await setMessengerPresence(phone, MESSENGER_GLOBAL_PRESENCE_CHANNEL);
}

export async function clearMessengerPresence(phone: string): Promise<void> {
  await redisDel(presenceKey(phone));
  lastPresenceWriteByPhone.delete(phone);
}

export async function getMessengerPresence(phone: string): Promise<MessengerPresence | null> {
  return redisGetJson<MessengerPresence>(presenceKey(phone));
}

export function isViewingChannel(presence: MessengerPresence | null, channel: string): boolean {
  if (!presence) return false;
  return presence.channel === channel && Date.now() - presence.at < MESSENGER_PRESENCE_TTL_SEC * 1000;
}

export function isMessengerOnline(presence: MessengerPresence | null): boolean {
  if (!presence) return false;
  return Date.now() - presence.at < MESSENGER_PRESENCE_TTL_SEC * 1000;
}

export async function setMessengerTyping(
  channel: string,
  phone: string,
  active: boolean,
): Promise<void> {
  if (active) {
    await redisSet(typingKey(channel, phone), "1", MESSENGER_TYPING_TTL_SEC);
  } else {
    await redisDel(typingKey(channel, phone));
  }
  void publishTypingEvent({ channel, peerPhone: phone, active, excludePhone: phone }).catch(() => {});
}

export async function isMessengerTyping(channel: string, phone: string): Promise<boolean> {
  const raw = await redisGet(typingKey(channel, phone));
  return raw != null;
}
