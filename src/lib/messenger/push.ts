"use client";

import { MESSENGER_PUSH_PREFS_KEY } from "./constants";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupportStatus = "unsupported" | "denied" | "default" | "granted";

export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as PushSupportStatus;
}

export function isMessengerPushEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MESSENGER_PUSH_PREFS_KEY) === "1";
}

export function setMessengerPushEnabledLocally(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MESSENGER_PUSH_PREFS_KEY, enabled ? "1" : "0");
}

export async function fetchMessengerVapidPublicKey(): Promise<string | null> {
  const res = await fetch("/api/messenger/push/vapid");
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey?: string | null };
  return data.publicKey ?? null;
}

export async function subscribeMessengerPush(): Promise<boolean> {
  if (getPushSupportStatus() === "unsupported") return false;

  const publicKey = await fetchMessengerVapidPublicKey();
  if (!publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setMessengerPushEnabledLocally(false);
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const res = await fetch("/api/messenger/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    setMessengerPushEnabledLocally(false);
    return true;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await fetch("/api/messenger/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  if (getPushSupportStatus() !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const json = existing.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      const res = await fetch("/api/messenger/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
