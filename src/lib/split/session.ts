import type { SplitSession } from "./types";
import { DEVICE_KEY_STORAGE_KEY, SESSION_STORAGE_KEY } from "./constants";

/**
 * A user can belong to several rooms at once (see the "мои комнаты" list on the
 * home screen) — this key holds every locally-known room's session, plus a
 * recency-ordered list of room ids so the home page can show the most recently
 * opened room first. `SESSION_STORAGE_KEY` is the pre-multi-room format kept
 * only so existing local sessions aren't dropped on upgrade — it's migrated
 * into the new store on first read and never written to again.
 */
const SESSIONS_STORAGE_KEY = "qhub_split_sessions_v2";

interface SessionStore {
  sessions: Record<string, SplitSession>;
  /** Room ids, most recently used first. */
  order: string[];
}

function emptyStore(): SessionStore {
  return { sessions: {}, order: [] };
}

function readStore(): SessionStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionStore;
      if (parsed && typeof parsed === "object" && parsed.sessions) {
        return { sessions: parsed.sessions, order: parsed.order ?? Object.keys(parsed.sessions) };
      }
    }
  } catch {
    /* fall through to legacy migration */
  }

  // One-time migration from the single-room format.
  try {
    const legacyRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as SplitSession;
      if (legacy?.roomId) {
        const store: SessionStore = { sessions: { [legacy.roomId]: legacy }, order: [legacy.roomId] };
        writeStore(store);
        return store;
      }
    }
  } catch {
    /* ignore corrupt legacy data */
  }
  return emptyStore();
}

function writeStore(store: SessionStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(store));
}

/** Saves/updates a room's session and moves it to the front of the recency list. */
export function saveSplitSession(session: SplitSession): void {
  if (typeof localStorage === "undefined") return;
  const store = readStore();
  store.sessions[session.roomId] = session;
  store.order = [session.roomId, ...store.order.filter((id) => id !== session.roomId)];
  writeStore(store);
}

/** Bumps a room to the front of the recency list without changing its session. */
export function touchSplitSession(roomId: string): void {
  if (typeof localStorage === "undefined") return;
  const store = readStore();
  if (!store.sessions[roomId]) return;
  store.order = [roomId, ...store.order.filter((id) => id !== roomId)];
  writeStore(store);
}

/** Without a roomId, returns the most recently used session (back-compat default). */
export function loadSplitSession(roomId?: string): SplitSession | null {
  if (typeof localStorage === "undefined") return null;
  const store = readStore();
  if (roomId) return store.sessions[roomId] ?? null;
  const mostRecent = store.order[0];
  return (mostRecent && store.sessions[mostRecent]) || null;
}

/** All locally-known rooms, most recently used first — powers the "мои комнаты" list. */
export function listSplitSessions(): SplitSession[] {
  if (typeof localStorage === "undefined") return [];
  const store = readStore();
  return store.order.map((id) => store.sessions[id]).filter((s): s is SplitSession => Boolean(s));
}

/** Removes one room from the local list — doesn't affect the room server-side. */
export function removeSplitSession(roomId: string): void {
  if (typeof localStorage === "undefined") return;
  const store = readStore();
  delete store.sessions[roomId];
  store.order = store.order.filter((id) => id !== roomId);
  writeStore(store);
}

/** Wipes every locally-known room session (used by the "reset local session" button). */
export function clearSplitSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSIONS_STORAGE_KEY);
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
