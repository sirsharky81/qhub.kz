import { SESSION_DIALOGS_KEY } from "./constants";
import { fetchRoomStatus } from "./client";
import { clearChatHistory } from "./history-db";
import { getRoomKey, removeRoomKey } from "./room-keys";
import type { LocalDialog } from "./types";

function migrateDialogsFromSessionStorage(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SESSION_DIALOGS_KEY)) return;
  try {
    const legacy = sessionStorage.getItem(SESSION_DIALOGS_KEY);
    if (legacy) {
      localStorage.setItem(SESSION_DIALOGS_KEY, legacy);
      sessionStorage.removeItem(SESSION_DIALOGS_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadLocalDialogs(): LocalDialog[] {
  if (typeof window === "undefined") return [];
  migrateDialogsFromSessionStorage();
  try {
    const raw = localStorage.getItem(SESSION_DIALOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalDialog[];
  } catch {
    return [];
  }
}

export function saveLocalDialogs(dialogs: LocalDialog[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_DIALOGS_KEY, JSON.stringify(dialogs));
}

export function upsertLocalDialog(dialog: LocalDialog): void {
  const list = loadLocalDialogs().filter((d) => d.id !== dialog.id);
  list.unshift(dialog);
  saveLocalDialogs(list);
}

export function removeLocalDialog(id: string): void {
  saveLocalDialogs(loadLocalDialogs().filter((d) => d.id !== id));
}

export function removeRoomDialog(roomId: string): void {
  removeLocalDialog(`room:${roomId.toUpperCase()}`);
}

export async function cleanupRoomLocalState(roomId: string): Promise<void> {
  const id = roomId.toUpperCase();
  await clearChatHistory(`room:${id}`);
  removeRoomDialog(id);
  removeRoomKey(id);
}

export async function syncRoomDialogs(): Promise<LocalDialog[]> {
  const dialogs = loadLocalDialogs();
  const rooms = dialogs.filter((d) => d.kind === "room" && d.roomId);
  if (rooms.length === 0) return dialogs;

  let changed = false;
  const removeIds = new Set<string>();

  for (const dialog of rooms) {
    const roomId = dialog.roomId!.toUpperCase();

    if (!getRoomKey(roomId)) {
      removeIds.add(dialog.id);
      await clearChatHistory(`room:${roomId}`);
      changed = true;
      continue;
    }

    const status = await fetchRoomStatus(roomId);
    if (!status) {
      removeIds.add(dialog.id);
      removeRoomKey(roomId);
      await clearChatHistory(`room:${roomId}`);
      changed = true;
      continue;
    }

    if (!status.isMember && status.otherCount === 0) {
      removeIds.add(dialog.id);
      removeRoomKey(roomId);
      await clearChatHistory(`room:${roomId}`);
      changed = true;
    }
  }

  if (!changed) return dialogs;

  const next = dialogs.filter((d) => !removeIds.has(d.id));
  saveLocalDialogs(next);
  return next;
}
