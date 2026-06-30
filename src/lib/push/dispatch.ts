import type { WebPushPayload, WebPushSubscription } from "@/lib/family/push-server";

export interface PushTarget extends WebPushSubscription {
  platform?: "web" | "ios" | "android";
  nativeToken?: string;
}

export async function dispatchPushNotifications(
  subscriptions: PushTarget[],
  payload: WebPushPayload,
): Promise<void> {
  const webSubs = subscriptions.filter(
    (s) => !s.platform || s.platform === "web" || (!s.nativeToken && s.keys.p256dh !== "native"),
  );
  const nativeSubs = subscriptions.filter(
    (s) => (s.platform === "ios" || s.platform === "android") && s.nativeToken,
  );

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
