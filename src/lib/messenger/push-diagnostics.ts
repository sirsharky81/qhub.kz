import { loadWhitelist } from "./store";
import { getMessengerPushSubscriptions } from "./push-store";
import type { MessengerPushSubscription } from "./types";

export interface MessengerPushPhoneStats {
  phone: string;
  total: number;
  web: number;
  android: number;
  ios: number;
  unknown: number;
}

export interface MessengerPushDiagnosticsSnapshot {
  generatedAt: number;
  activeWhitelistPhones: number;
  phonesWithAnySubscription: number;
  phonesWithoutSubscriptions: string[];
  phonesWithWebSubscription: number;
  phonesWithNativeSubscription: number;
  phonesWithAndroidNativeSubscription: number;
  phonesWithIosNativeSubscription: number;
  totalSubscriptions: number;
  subscriptionsByPlatform: {
    web: number;
    android: number;
    ios: number;
    unknown: number;
  };
  invalidNativeSubscriptions: Array<{ phone: string; endpoint: string }>;
  topPhones: MessengerPushPhoneStats[];
}

function classify(sub: MessengerPushSubscription): "web" | "android" | "ios" | "unknown" {
  if (sub.platform === "android") return "android";
  if (sub.platform === "ios") return "ios";
  if (sub.platform === "web") return "web";
  if (sub.nativeToken || sub.keys?.p256dh === "native") return "unknown";
  return "web";
}

export async function getMessengerPushDiagnosticsSnapshot(): Promise<MessengerPushDiagnosticsSnapshot> {
  const whitelist = await loadWhitelist();
  const activePhones = Object.values(whitelist)
    .filter((entry) => entry.status === "active")
    .map((entry) => entry.phone)
    .sort();

  let phonesWithAnySubscription = 0;
  let phonesWithWebSubscription = 0;
  let phonesWithNativeSubscription = 0;
  let phonesWithAndroidNativeSubscription = 0;
  let phonesWithIosNativeSubscription = 0;
  let totalSubscriptions = 0;
  const subscriptionsByPlatform = { web: 0, android: 0, ios: 0, unknown: 0 };
  const phonesWithoutSubscriptions: string[] = [];
  const invalidNativeSubscriptions: Array<{ phone: string; endpoint: string }> = [];
  const topPhones: MessengerPushPhoneStats[] = [];

  for (const phone of activePhones) {
    const subs = await getMessengerPushSubscriptions(phone);
    const stats: MessengerPushPhoneStats = {
      phone,
      total: subs.length,
      web: 0,
      android: 0,
      ios: 0,
      unknown: 0,
    };

    if (subs.length === 0) {
      phonesWithoutSubscriptions.push(phone);
      topPhones.push(stats);
      continue;
    }

    phonesWithAnySubscription += 1;
    totalSubscriptions += subs.length;

    let hasWeb = false;
    let hasNative = false;
    let hasAndroid = false;
    let hasIos = false;

    for (const sub of subs) {
      const bucket = classify(sub);
      subscriptionsByPlatform[bucket] += 1;
      stats[bucket] += 1;

      if (bucket === "web") hasWeb = true;
      if (bucket === "android" || bucket === "ios" || sub.nativeToken) hasNative = true;
      if (bucket === "android") hasAndroid = true;
      if (bucket === "ios") hasIos = true;

      const looksNative = bucket === "android" || bucket === "ios" || sub.keys?.p256dh === "native";
      if (looksNative && !sub.nativeToken) {
        invalidNativeSubscriptions.push({ phone, endpoint: sub.endpoint });
      }
    }

    if (hasWeb) phonesWithWebSubscription += 1;
    if (hasNative) phonesWithNativeSubscription += 1;
    if (hasAndroid) phonesWithAndroidNativeSubscription += 1;
    if (hasIos) phonesWithIosNativeSubscription += 1;
    topPhones.push(stats);
  }

  topPhones.sort((a, b) => b.total - a.total || a.phone.localeCompare(b.phone));

  return {
    generatedAt: Date.now(),
    activeWhitelistPhones: activePhones.length,
    phonesWithAnySubscription,
    phonesWithoutSubscriptions,
    phonesWithWebSubscription,
    phonesWithNativeSubscription,
    phonesWithAndroidNativeSubscription,
    phonesWithIosNativeSubscription,
    totalSubscriptions,
    subscriptionsByPlatform,
    invalidNativeSubscriptions,
    topPhones: topPhones.slice(0, 30),
  };
}
