import type { FamilyLocationRequestMode, FamilyPushSubscription } from "@/lib/family/types";
import type { WebPushPayload, WebPushSubscription } from "@/lib/family/push-server";

export interface PushTarget extends WebPushSubscription {
  platform?: "web" | "ios" | "android";
  nativeToken?: string;
}

function isNativeSub(sub: PushTarget): boolean {
  return (sub.platform === "ios" || sub.platform === "android") && Boolean(sub.nativeToken);
}

function isWebSub(sub: PushTarget): boolean {
  return !isNativeSub(sub);
}

function isAndroidNative(sub: PushTarget): sub is PushTarget & { platform: "android"; nativeToken: string } {
  return sub.platform === "android" && Boolean(sub.nativeToken);
}

export async function dispatchPushNotifications(
  subscriptions: PushTarget[],
  payload: WebPushPayload,
): Promise<void> {
  const webSubs = subscriptions.filter(isWebSub);
  const nativeSubs = subscriptions.filter(isNativeSub);

  const { sendWebPush } = await import("@/lib/family/push-server");
  if (webSubs.length > 0) {
    await sendWebPush(webSubs, payload);
  }

  if (nativeSubs.length > 0) {
    const { sendFcmPush } = await import("@/lib/push/fcm-server");
    await sendFcmPush(
      nativeSubs.map((s) => ({
        token: s.nativeToken ?? s.endpoint,
        platform: s.platform as "ios" | "android",
      })),
      payload,
    );
  }
}

export async function dispatchFamilyLocationRequestPush(
  subscriptions: FamilyPushSubscription[],
  input: {
    mode: FamilyLocationRequestMode;
    requestId: string;
    parentName: string;
    title: string;
    body: string;
    url: string;
    icon: string;
    badge: string;
  },
): Promise<number> {
  const basePayload: WebPushPayload = {
    title: input.title,
    body: input.body,
    url: input.url,
    icon: input.icon,
    badge: input.badge,
    action: "family:locate",
    requestId: input.requestId,
  };

  let sent = 0;

  if (input.mode === "notify") {
    await dispatchPushNotifications(subscriptions, basePayload);
    return subscriptions.length;
  }

  const androidSubs = subscriptions.filter(isAndroidNative);
  const otherSubs = subscriptions.filter((s) => !isAndroidNative(s));

  if (androidSubs.length > 0) {
    const { sendFcmPush } = await import("@/lib/push/fcm-server");
    await sendFcmPush(
      androidSubs.map((s) => ({
        token: s.nativeToken!,
        platform: "android" as const,
      })),
      { ...basePayload, silent: true },
    );
    sent += androidSubs.length;
  }

  if (otherSubs.length > 0) {
    await dispatchPushNotifications(otherSubs, { ...basePayload, silent: false });
    sent += otherSubs.length;
  }

  return sent;
}
