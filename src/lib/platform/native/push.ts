import type { FamilySession } from "@/lib/family/types";
import type { NotificationContext } from "../notifications";
import { MESSENGER_NATIVE_PUSH_TOKEN_KEY } from "@/lib/messenger/constants";
import { isNativePlatform, getNativePlatform } from "../runtime";
import { platformFetch } from "../api-client";
import { PlatformOfflineQueue } from "../offlineQueue";
import { PlatformLogger } from "../logger";

export async function registerNativePush(
  context: NotificationContext,
  session?: FamilySession,
): Promise<boolean> {
  if (!isNativePlatform()) return false;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  const platform = getNativePlatform() === "ios" ? "ios" : "android";

  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    void PushNotifications.addListener("registration", (token) => {
      if (typeof window !== "undefined" && context === "messenger") {
        localStorage.setItem(MESSENGER_NATIVE_PUSH_TOKEN_KEY, token.value);
      }

      const endpoint =
        context === "family" ? "/api/family/push/subscribe" : "/api/messenger/push/subscribe";

      const payload =
        context === "family"
          ? {
              subscription: {
                endpoint: token.value,
                keys: { p256dh: "native", auth: "native" },
                platform,
                nativeToken: token.value,
              },
            }
          : {
              subscription: {
                endpoint: token.value,
                keys: { p256dh: "native", auth: "native" },
                platform,
                nativeToken: token.value,
              },
            };

      const headers: Record<string, string> | undefined =
        context === "family" && session
          ? {
              "X-Family-Member-Id": session.memberId,
              "X-Family-Access-Token": session.accessToken,
            }
          : undefined;

      void PlatformOfflineQueue.enqueue({
        type: "pushToken",
        endpoint,
        payload,
        headers,
      }).then(() => finish(true));
    });

    void PushNotifications.addListener("registrationError", (err) => {
      PlatformLogger.error("Push registration error", new Error(err.error));
      finish(false);
    });

    void PushNotifications.register().catch(() => finish(false));

    setTimeout(() => finish(false), 15000);
  });
}

export async function unregisterNativePush(context: NotificationContext): Promise<void> {
  if (!isNativePlatform()) return;

  const tokenKey =
    context === "messenger"
      ? MESSENGER_NATIVE_PUSH_TOKEN_KEY
      : "qhub_family_native_push_token";
  const token = localStorage.getItem(tokenKey);

  const apiEndpoint =
    context === "family" ? "/api/family/push/subscribe" : "/api/messenger/push/subscribe";
  const platform = getNativePlatform() === "ios" ? "ios" : "android";

  if (token) {
    await platformFetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remove: true,
        subscription: {
          endpoint: token,
          keys: { p256dh: "native", auth: "native" },
          platform,
          nativeToken: token,
        },
      }),
    }).catch(() => {});
    localStorage.removeItem(tokenKey);

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.unregister();
    } catch (err) {
      PlatformLogger.error(
        "Push unregister failed",
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
}

export async function initNativePushListeners(): Promise<void> {
  if (!isNativePlatform()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  function navigateFromPushData(data: Record<string, unknown> | undefined): void {
    const url = typeof data?.url === "string" ? data.url.trim() : "";
    if (!url || typeof window === "undefined") return;
    try {
      const target = new URL(url, window.location.origin);
      const current = window.location.pathname + window.location.search;
      if (target.pathname + target.search === current) return;
      window.location.href = target.pathname + target.search + target.hash;
    } catch {
      window.location.href = url;
    }
  }

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    PlatformLogger.info("Push received in foreground", notification);
    navigateFromPushData(notification.data as Record<string, unknown> | undefined);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    navigateFromPushData(action.notification.data as Record<string, unknown> | undefined);
  });
}
