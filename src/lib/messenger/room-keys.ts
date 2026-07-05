import { ROOM_KEY_PREFIX } from "./constants";

function storageKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId.toUpperCase()}`;
}

function migrateRoomKeyFromSessionStorage(roomId: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey(roomId);
  try {
    if (localStorage.getItem(key)) return;
    const legacy = sessionStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
  } catch {
    // localStorage may be restricted (iOS private/PWA edge cases). Keep session value as fallback.
  }
}

export function getRoomKey(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  migrateRoomKeyFromSessionStorage(roomId);
  const key = storageKey(roomId);
  try {
    const local = localStorage.getItem(key);
    if (local) return local;
  } catch {
    // fall through to session storage
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setRoomKey(roomId: string, keyBase64Url: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey(roomId);
  try {
    localStorage.setItem(key, keyBase64Url);
    sessionStorage.setItem(key, keyBase64Url);
  } catch {
    // localStorage may fail on some mobile environments; keep key in sessionStorage at least.
    try {
      sessionStorage.setItem(key, keyBase64Url);
    } catch {
      // ignore
    }
  }
}

export function removeRoomKey(roomId: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey(roomId);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasRoomKey(roomId: string): boolean {
  return Boolean(getRoomKey(roomId));
}
