import { UNREAD_COUNT_KEY, UNREAD_EVENT } from "./constants";

export interface UnreadMap {
  [dialogId: string]: number;
}

export interface RoomUnreadSnapshot {
  id: string;
  unreadCount?: number | null;
}

let activeChannel: string | null = null;

export function setActiveChatChannel(channel: string | null): void {
  activeChannel = channel;
}

export function loadRoomUnreadMap(): UnreadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UNREAD_COUNT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UnreadMap;
  } catch {
    return {};
  }
}

export function saveRoomUnreadMap(map: UnreadMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(UNREAD_COUNT_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(UNREAD_EVENT));
}

export function incrementRoomUnread(dialogId: string, channel?: string): void {
  if (channel && activeChannel === channel) return;
  const map = loadRoomUnreadMap();
  map[dialogId] = (map[dialogId] ?? 0) + 1;
  saveRoomUnreadMap(map);
}

export function clearRoomUnread(dialogId: string): void {
  const map = loadRoomUnreadMap();
  if (!map[dialogId]) return;
  delete map[dialogId];
  saveRoomUnreadMap(map);
}

export function getRoomUnread(dialogId: string): number {
  return loadRoomUnreadMap()[dialogId] ?? 0;
}

export function totalRoomUnread(): number {
  return Object.values(loadRoomUnreadMap()).reduce((a, b) => a + b, 0);
}

export function resolveRoomUnread(serverUnread: number | null | undefined, dialogId: string): number {
  if (typeof serverUnread === "number" && Number.isFinite(serverUnread)) {
    return Math.max(0, serverUnread);
  }
  return getRoomUnread(dialogId);
}

export function totalRoomUnreadFromServer(dialogs: RoomUnreadSnapshot[]): number {
  const allHaveServerUnread = dialogs.every((d) => typeof d.unreadCount === "number");
  if (!allHaveServerUnread) return totalRoomUnread();
  return dialogs.reduce((sum, dialog) => sum + Math.max(0, dialog.unreadCount ?? 0), 0);
}

export function syncRoomUnreadCache(dialogs: RoomUnreadSnapshot[]): void {
  const map = loadRoomUnreadMap();
  let changed = false;
  for (const dialog of dialogs) {
    if (typeof dialog.unreadCount !== "number" || !Number.isFinite(dialog.unreadCount)) continue;
    const nextValue = Math.max(0, dialog.unreadCount);
    if (nextValue > 0) {
      if ((map[dialog.id] ?? 0) !== nextValue) {
        map[dialog.id] = nextValue;
        changed = true;
      }
      continue;
    }
    if (map[dialog.id]) {
      delete map[dialog.id];
      changed = true;
    }
  }
  if (changed) saveRoomUnreadMap(map);
}

export function subscribeUnreadChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UNREAD_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(UNREAD_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
