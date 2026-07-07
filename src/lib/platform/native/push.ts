import type { FamilySession } from "@/lib/family/types";
import { FAMILY_NATIVE_PUSH_TOKEN_KEY } from "@/lib/family/constants";
import type { NotificationContext } from "../notifications";
import { MESSENGER_NATIVE_PUSH_TOKEN_KEY } from "@/lib/messenger/constants";
import { isNativePlatform, getNativePlatform } from "../runtime";
import { platformFetch } from "../api-client";
import { PlatformLogger } from "../logger";
import { isNativePushConfigured } from "./app-capabilities";

const registrationListenersAttached = new Set<NotificationContext>();
const pendingRegistrations = new Map<NotificationContext, Set<(ok: boolean) => void>>();
const SUBSCRIBE_RETRY_DELAY_MS = 800;
const SUBSCRIBE_MAX_ATTEMPTS = 3;

function queueRegistrationWaiter(context: NotificationContext, finish: (ok: boolean) => void): void {
  const waiters = pendingRegistrations.get(context) ?? new Set<(ok: boolean) => void>();
  waiters.add(finish);
  pendingRegistrations.set(context, waiters);
}

function removeRegistrationWaiter(context: NotificationContext, finish: (ok: boolean) => void): void {
  const waiters = pendingRegistrations.get(context);
  if (!waiters) return;
  waiters.delete(finish);
  if (waiters.size === 0) {
    pendingRegistrations.delete(context);
  }
}

function resolveRegistrationWaiters(context: NotificationContext, ok: boolean): void {
  const waiters = pendingRegistrations.get(context);
  if (!waiters) return;
  pendingRegistrations.delete(context);
  for (const resolve of waiters) resolve(ok);
}

function nativePushTokenKey(context: NotificationContext): string {
  return context === "messenger" ? MESSENGER_NATIVE_PUSH_TOKEN_KEY : FAMILY_NATIVE_PUSH_TOKEN_KEY;
}

async function postNativeSubscription(
  endpoint: string,
  payload: unknown,
  headers: Record<string, string> | undefined,
): Promise<boolean> {
  for (let attempt = 0; attempt < SUBSCRIBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await platformFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
    if (attempt < SUBSCRIBE_MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, SUBSCRIBE_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return false;
}

async function ensureAndroidPushChannel(): Promise<void> {
  if (getNativePlatform() !== "android") return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  try {
    await PushNotifications.createChannel({
      id: "qhub_default",
      name: "QHub",
      description: "Уведомления QHub",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    });
    await PushNotifications.createChannel({
      id: "qhub_silent",
      name: "QHub — фоновые",
      description: "Тихие служебные уведомления QHub",
      importance: 2,
      visibility: 1,
      vibration: false,
    });
  } catch {
    // Older plugin versions may not expose createChannel.
  }
}

function readPushData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  return data ?? {};
}

async function handleFamilyLocateFromPush(data: Record<string, unknown> | undefined): Promise<boolean> {
  const action = typeof data?.action === "string" ? data.action : "";
  if (action !== "family:locate") return false;
  const { handleFamilyLocatePush } = await import("@/lib/family/location-request-handler");
  const requestId = typeof data?.requestId === "string" ? data.requestId : undefined;
  return handleFamilyLocatePush({ action, requestId });
}

function attachRegistrationListeners(
  context: NotificationContext,
  session: FamilySession | undefined,
): void {
  if (registrationListenersAttached.has(context)) return;
  registrationListenersAttached.add(context);

  void import("@capacitor/push-notifications").then(({ PushNotifications }) => {
    void PushNotifications.addListener("registration", (token) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(nativePushTokenKey(context), token.value);
      }

      const endpoint =
        context === "family" ? "/api/family/push/subscribe" : "/api/messenger/push/subscribe";
      const platform = getNativePlatform() === "ios" ? "ios" : "android";

      const payload = {
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

      void postNativeSubscription(endpoint, payload, headers).then((ok) => {
        resolveRegistrationWaiters(context, ok);
      });
    });

    void PushNotifications.addListener("registrationError", (err) => {
      PlatformLogger.error("Push registration error", new Error(err.error));
      resolveRegistrationWaiters(context, false);
    });
  });
}

export async function registerNativePush(
  context: NotificationContext,
  session?: FamilySession,
): Promise<boolean> {
  if (!isNativePlatform()) return false;

  if (getNativePlatform() === "android") {
    const configured = await isNativePushConfigured();
    if (!configured) {
      PlatformLogger.warn("Native push skipped — google-services.json missing in Android build");
      return false;
    }
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    queueRegistrationWaiter(context, finish);
    attachRegistrationListeners(context, session);

    void (async () => {
      try {
        await ensureAndroidPushChannel();
        await PushNotifications.register();
      } catch (err) {
        PlatformLogger.error(
          "Push register failed",
          err instanceof Error ? err : new Error(String(err)),
        );
        finish(false);
      }
    })();

    setTimeout(() => {
      removeRegistrationWaiter(context, finish);
      finish(false);
    }, 20000);
  });
}

export async function unregisterNativePush(context: NotificationContext): Promise<void> {
  if (!isNativePlatform()) return;

  const tokenKey = nativePushTokenKey(context);
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

export async function initNativePushListeners(): Promise<void> {
  if (!isNativePlatform()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    PlatformLogger.info("Push received in foreground", notification);
    const data = readPushData(notification.data as Record<string, unknown> | undefined);
    void handleFamilyLocateFromPush(data).then((handled) => {
      if (!handled) navigateFromPushData(data);
    });
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = readPushData(action.notification.data as Record<string, unknown> | undefined);
    void handleFamilyLocateFromPush(data).finally(() => {
      navigateFromPushData(data);
    });
  });
}
