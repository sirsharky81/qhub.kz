import { Capacitor } from "@capacitor/core";

let nativePlatform: boolean | null = null;
let platformName: "ios" | "android" | "web" = "web";

/** Capacitor WebView origin when androidScheme/iosScheme is https. */
function isCapacitorWebOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const { protocol, hostname, port } = window.location;
  if (protocol === "capacitor:") return true;
  // Dev: localhost:3000 — not native shell
  if (port === "3000" || port === "3001") return false;
  return hostname === "localhost" && protocol === "https:";
}

export function isNativePlatform(): boolean {
  if (nativePlatform !== null) return nativePlatform;

  try {
    if (Capacitor.isNativePlatform()) {
      nativePlatform = true;
      const p = Capacitor.getPlatform();
      platformName = p === "ios" || p === "android" ? p : "web";
      return true;
    }
  } catch {
    /* Capacitor not on window yet */
  }

  nativePlatform = isCapacitorWebOrigin();
  platformName = nativePlatform ? "android" : "web";
  return nativePlatform;
}

export function getNativePlatform(): "ios" | "android" | "web" {
  isNativePlatform();
  return platformName;
}

export const NATIVE_API_BASE =
  process.env.NEXT_PUBLIC_NATIVE_API_BASE?.replace(/\/$/, "") || "https://www.qhub.kz";
