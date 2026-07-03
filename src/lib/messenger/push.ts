"use client";

import { MESSENGER_NATIVE_PUSH_TOKEN_KEY, MESSENGER_PUSH_PREFS_KEY } from "./constants";
import { isNativePlatform, getNativePlatform } from "@/lib/platform/runtime";
import { platformFetch } from "@/lib/platform/api-client";

export class NativePushNotConfiguredError extends Error {
  constructor() {
    super("native_push_not_configured");
    this.name = "NativePushNotConfiguredError";
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupportStatus = "unsupported" | "denied" | "default" | "granted";

export function isMessengerPushEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MESSENGER_PUSH_PREFS_KEY) === "1";
}

export function setMessengerPushEnabledLocally(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MESSENGER_PUSH_PREFS_KEY, enabled ? "1" : "0");
}

/** Web Push API (service worker) — not Capacitor FCM. */
export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Sync hint — on native, use resolveMessengerPushSupportStatus for accurate permission. */
export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === "undefined") return "unsupported";
  if (isNativePlatform()) return "default";
  if (!isWebPushSupported()) return "unsupported";
  return Notification.permission as PushSupportStatus;
}

export async function resolveMessengerPushSupportStatus(): Promise<PushSupportStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (isNativePlatform()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === "granted") return "granted";
      if (receive === "denied") return "denied";
      return "default";
    } catch {
      return "unsupported";
    }
  }
  return getPushSupportStatus();
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  try {
    let registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    return registration;
  } catch {
    return null;
  }
}

export async function fetchMessengerVapidPublicKey(): Promise<string | null> {
  const res = await fetch("/api/messenger/push/vapid");
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey?: string | null };
  return data.publicKey ?? null;
}

export async function subscribeMessengerPush(): Promise<boolean> {
  if (isNativePlatform()) {
    if (getNativePlatform() === "android") {
      const { isNativePushConfigured } = await import("@/lib/platform/native/app-capabilities");
      if (!(await isNativePushConfigured())) {
        throw new NativePushNotConfiguredError();
      }
    }
    const { PlatformNotifications } = await import("@/lib/platform/notifications");
    const perm = await PlatformNotifications.requestPermission();
    if (perm !== "granted") {
      setMessengerPushEnabledLocally(false);
      return false;
    }
    const ok = await PlatformNotifications.subscribe("messenger");
    if (ok) setMessengerPushEnabledLocally(true);
    return ok;
  }

  if (getPushSupportStatus() === "unsupported") return false;

  const publicKey = await fetchMessengerVapidPublicKey();
  if (!publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setMessengerPushEnabledLocally(false);
    return false;
  }

  const registration = await ensureServiceWorkerReady();
  if (!registration) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const res = await platformFetch("/api/messenger/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    }),
  });

  if (!res.ok) return false;
  setMessengerPushEnabledLocally(true);
  return true;
}

export async function unsubscribeMessengerPush(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const { unregisterNativePush } = await import("@/lib/platform/native/push");
      await unregisterNativePush("messenger");
    } catch {
      /* keep going — clear local pref even if native layer fails */
    }
    setMessengerPushEnabledLocally(false);
    return true;
  }

  if (typeof window === "undefined" || !isWebPushSupported()) {
    setMessengerPushEnabledLocally(false);
    return true;
  }

  const registration = await ensureServiceWorkerReady();
  if (!registration) {
    setMessengerPushEnabledLocally(false);
    return true;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await platformFetch("/api/messenger/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          remove: true,
          subscription: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          },
        }),
      });
    }
    await subscription.unsubscribe();
  }

  setMessengerPushEnabledLocally(false);
  return true;
}

export async function ensureMessengerPushSubscription(): Promise<boolean> {
  if (!isMessengerPushEnabledLocally()) return false;

  if (isNativePlatform()) {
    const status = await resolveMessengerPushSupportStatus();
    if (status !== "granted") return false;
    return subscribeMessengerPush();
  }

  if (getPushSupportStatus() !== "granted") return false;

  const registration = await ensureServiceWorkerReady();
  if (!registration) return false;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const json = existing.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      const res = await platformFetch("/api/messenger/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          },
        }),
      });
      return res.ok;
    }
  }

  return subscribeMessengerPush();
}
