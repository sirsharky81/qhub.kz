import webpush from "web-push";
import type { FamilyLocationRequestMode, FamilyPushSubscription } from "./types";

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
  action?: "default" | "family:locate" | "family:sos" | "messenger:message" | "messenger:call";
  silent?: boolean;
  requestId?: string;
  callId?: string;
  callMedia?: "audio" | "video";
}

const LOCATE_PUSH_TITLE = "Ты где?";
const LOCATE_PUSH_BODY =
  "Срочно позвони или зайди в приложение QHub, чтобы отправить геопозицию.";
const CHILD_APP_URL = "/tools/family/child";

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
  payload: { title: string; body: string; url: string; action?: WebPushPayload["action"] },
): Promise<void> {
  const { dispatchPushNotifications } = await import("@/lib/push/dispatch");
  await dispatchPushNotifications(subscriptions, {
    ...payload,
    icon: "/tools/family/icon-192.png",
    badge: "/icon-192.png",
    action: payload.action ?? "default",
  });
}

export async function sendFamilyLocationRequestPush(
  subscriptions: FamilyPushSubscription[],
  input: { mode: FamilyLocationRequestMode; requestId: string; parentName: string },
): Promise<number> {
  if (subscriptions.length === 0) return 0;

  const { dispatchFamilyLocationRequestPush } = await import("@/lib/push/dispatch");
  return dispatchFamilyLocationRequestPush(subscriptions, {
    mode: input.mode,
    requestId: input.requestId,
    parentName: input.parentName,
    title: LOCATE_PUSH_TITLE,
    body: LOCATE_PUSH_BODY,
    url: CHILD_APP_URL,
    icon: "/tools/family/icon-192.png",
    badge: "/icon-192.png",
  });
}
