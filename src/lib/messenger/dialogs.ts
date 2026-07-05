import { SESSION_DIALOGS_KEY } from "./constants";
import { fetchRoomStatusLookup } from "./client";
import { clearChatHistory } from "./history-db";
import { removeRoomKey } from "./room-keys";
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

    let status: Awaited<ReturnType<typeof fetchRoomStatusLookup>>;
    try {
      status = await fetchRoomStatusLookup(roomId);
    } catch {
      // transient network issues should not delete local room state
      continue;
    }
    if (status.kind === "not_found") {
      removeIds.add(dialog.id);
      removeRoomKey(roomId);
      await clearChatHistory(`room:${roomId}`);
      changed = true;
      continue;
    }
    if (status.kind !== "ok") continue;

    if (!status.data.isMember && status.data.otherCount === 0) {
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
