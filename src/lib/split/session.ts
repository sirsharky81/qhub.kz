import type { SplitSession } from "./types";
import { SESSION_STORAGE_KEY } from "./constants";

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
