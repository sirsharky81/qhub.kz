import { MESSENGER_ROOM_KEY_PREFIX } from "./constants";

export function setMessengerRoomKey(messengerRoomId: string, keyBase64Url: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${MESSENGER_ROOM_KEY_PREFIX}${messengerRoomId.toUpperCase()}`, keyBase64Url);
}

export function getMessengerRoomKeyRaw(messengerRoomId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(`${MESSENGER_ROOM_KEY_PREFIX}${messengerRoomId.toUpperCase()}`);
}

export async function getRoomKey(messengerRoomId: string): Promise<CryptoKey | null> {
  const raw = getMessengerRoomKeyRaw(messengerRoomId);
  if (!raw) return null;
  const { importRoomKeyBase64Url } = await import("@/lib/messenger/crypto");
  try {
    return await importRoomKeyBase64Url(raw);
  } catch {
    return null;
  }
}

export function clearMessengerRoomKey(messengerRoomId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(`${MESSENGER_ROOM_KEY_PREFIX}${messengerRoomId.toUpperCase()}`);
}
