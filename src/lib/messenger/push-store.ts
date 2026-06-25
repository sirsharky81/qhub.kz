import {
  MESSENGER_PRESENCE_TTL_SEC,
  MESSENGER_PUSH_TTL_SEC,
  REDIS_MESSENGER_PRESENCE_PREFIX,
  REDIS_MESSENGER_PUSH_PREFIX,
} from "./constants";
import { redisGetJson, redisSet } from "./redis";
import type { MessengerPresence, MessengerPushSubscription } from "./types";

function pushKey(phone: string): string {
  return `${REDIS_MESSENGER_PUSH_PREFIX}${phone}`;
}

function presenceKey(phone: string): string {
  return `${REDIS_MESSENGER_PRESENCE_PREFIX}${phone}`;
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
  const presence: MessengerPresence = { channel, at: Date.now() };
  await redisSet(presenceKey(phone), JSON.stringify(presence), MESSENGER_PRESENCE_TTL_SEC);
}

export async function getMessengerPresence(phone: string): Promise<MessengerPresence | null> {
  return redisGetJson<MessengerPresence>(presenceKey(phone));
}

export function isViewingChannel(presence: MessengerPresence | null, channel: string): boolean {
  if (!presence) return false;
  return presence.channel === channel && Date.now() - presence.at < MESSENGER_PRESENCE_TTL_SEC * 1000;
}
