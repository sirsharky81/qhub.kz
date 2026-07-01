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

const NATIVE_REMOTE_HOSTS = new Set(["qhub.kz", "www.qhub.kz"]);

/** Capacitor shell loading UI from production (server.url), not bundled localhost. */
export function isNativeRemoteShell(): boolean {
  if (!isNativePlatform()) return false;
  if (typeof window === "undefined") return true;
  return NATIVE_REMOTE_HOSTS.has(window.location.hostname);
}

/** Legacy bundled static export served from https://localhost. */
export function isNativeBundledShell(): boolean {
  return isNativePlatform() && !isNativeRemoteShell();
}

/** API prefix for native fetch — empty when UI and API share the same origin. */
export function getNativeApiBaseUrl(): string {
  if (!isNativePlatform()) return "";
  if (isNativeRemoteShell()) return "";
  return NATIVE_API_BASE;
}
