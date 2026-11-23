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

let memory: Record<"master" | "client", StoredAssistRoom | null> = {
  master: null,
  client: null,
};

export function loadAssistRoom(role: "master" | "client"): StoredAssistRoom | null {
  const cached = memory[role];
  if (cached && cached.expiresAt > Date.now() && cached.session?.roomId && cached.session.accessToken) {
    return cached;
  }
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(role));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAssistRoom;
    if (!parsed?.session?.roomId || !parsed.session.accessToken || !parsed.session.memberId) return null;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(storageKey(role));
      memory[role] = null;
      return null;
    }
    memory[role] = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAssistRoom(role: "master" | "client", room: StoredAssistRoom): void {
  memory[role] = room;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(role), JSON.stringify(room));
  } catch {
    /* the in-memory copy still keeps the room for this page */
  }
}

export function clearAssistRoom(role: "master" | "client"): void {
  memory[role] = null;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(role));
  } catch {
    /* ignore */
  }
}
