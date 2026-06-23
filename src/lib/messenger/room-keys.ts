import { ROOM_KEY_PREFIX } from "./constants";

function storageKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId.toUpperCase()}`;
}

function migrateRoomKeyFromSessionStorage(roomId: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey(roomId);
  if (localStorage.getItem(key)) return;
  try {
    const legacy = sessionStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function getRoomKey(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  migrateRoomKeyFromSessionStorage(roomId);
  return localStorage.getItem(storageKey(roomId));
}

export function setRoomKey(roomId: string, keyBase64Url: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey(roomId);
  localStorage.setItem(key, keyBase64Url);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function removeRoomKey(roomId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(roomId));
}

export function hasRoomKey(roomId: string): boolean {
  return Boolean(getRoomKey(roomId));
}
