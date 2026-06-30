import webpush from "web-push";
import type { FamilyPushSubscription } from "./types";

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
}

function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@qhub.kz";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return getVapidKeys()?.publicKey ?? null;
}

export async function sendWebPush(
  subscriptions: WebPushSubscription[],
  payload: WebPushPayload,
): Promise<void> {
  const vapid = getVapidKeys();
  if (!vapid || subscriptions.length === 0) return;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const data = JSON.stringify(payload);
  await Promise.allSettled(
    subscriptions
      .filter((sub) => sub.keys.p256dh !== "native")
      .map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        data,
      ),
    ),
  );
}

export async function sendFamilyPush(
  subscriptions: FamilyPushSubscription[],
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const { dispatchPushNotifications } = await import("@/lib/push/dispatch");
  await dispatchPushNotifications(subscriptions, {
    ...payload,
    icon: "/tools/family/icon-192.png",
    badge: "/icon-192.png",
  });
}
