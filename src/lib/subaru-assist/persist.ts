import type { AssistSession } from "./client";

const MASTER_KEY = "qhub:subaru-assist:master";
const CLIENT_KEY = "qhub:subaru-assist:client";

export interface StoredAssistRoom {
  session: AssistSession;
  expiresAt: number;
}

function storageKey(role: "master" | "client"): string {
  return role === "master" ? MASTER_KEY : CLIENT_KEY;
}

export function loadAssistRoom(role: "master" | "client"): StoredAssistRoom | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(role));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAssistRoom;
    if (!parsed?.session?.roomId || !parsed.session.accessToken || !parsed.session.memberId) return null;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(storageKey(role));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAssistRoom(role: "master" | "client", room: StoredAssistRoom): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(role), JSON.stringify(room));
}

export function clearAssistRoom(role: "master" | "client"): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(storageKey(role));
}
