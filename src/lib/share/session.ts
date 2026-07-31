import type { ShareSession } from "./types";
import { SESSION_STORAGE_KEY } from "./constants";

export function loadShareSession(): ShareSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShareSession;
  } catch {
    return null;
  }
}

export function saveShareSession(session: ShareSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearShareSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
