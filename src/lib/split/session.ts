import type { SplitSession } from "./types";
import { DEVICE_KEY_STORAGE_KEY, SESSION_STORAGE_KEY } from "./constants";

export function saveSplitSession(session: SplitSession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadSplitSession(): SplitSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SplitSession;
  } catch {
    return null;
  }
}

export function clearSplitSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/** Stable per-browser device key for whitelist / multi-device sessions. */
export function getOrCreateSplitDeviceKey(): string {
  if (typeof localStorage === "undefined") return `srv_${Date.now()}`;
  const existing = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
  if (existing) return existing;
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY_STORAGE_KEY, key);
  return key;
}
