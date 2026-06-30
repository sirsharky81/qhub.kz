import type { FamilySession } from "@/lib/family/types";
import type { NotificationContext } from "../notifications";
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
      const endpoint =
        context === "family" ? "/api/family/push/subscribe" : "/api/messenger/push/subscribe";

      const payload =
        context === "family"
          ? {
              subscription: {
                endpoint: token.value,
                keys: { p256dh: "", auth: "" },
                platform,
                nativeToken: token.value,
              },
            }
          : {
              subscription: {
                endpoint: token.value,
                keys: { p256dh: "", auth: "" },
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

export async function initNativePushListeners(): Promise<void> {
  if (!isNativePlatform()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    PlatformLogger.info("Push received in foreground", notification);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as { url?: string } | undefined;
    if (data?.url && typeof window !== "undefined") {
      window.location.href = data.url;
    }
  });
}
