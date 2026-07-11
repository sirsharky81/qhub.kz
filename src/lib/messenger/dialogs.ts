import { SESSION_DIALOGS_KEY } from "./constants";
import { deleteMessengerDialog, fetchRoomStatusLookup, leaveRoomApi } from "./client";
import { clearChatHistory } from "./history-db";
import { canonicalDmChatId, deriveDmChatId, normalizeKzPhone } from "./phone";
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

export function dedupeDialogsByRecipient(dialogs: LocalDialog[], myPhone: string): LocalDialog[] {
  const me = normalizeKzPhone(myPhone);
  if (!me) return dialogs;

  const dmByPeer = new Map<string, LocalDialog>();
  const roomById = new Map<string, LocalDialog>();
  const other: LocalDialog[] = [];

  for (const dialog of dialogs) {
    if (dialog.kind === "dm" && dialog.peerPhone) {
      const peer = normalizeKzPhone(dialog.peerPhone);
      const canonicalId = deriveDmChatId(me, peer);
      const prev = dmByPeer.get(peer);
      const next: LocalDialog = {
        ...dialog,
        id: canonicalId,
        peerPhone: peer,
      };
      if (!prev || next.createdAt >= prev.createdAt) {
        dmByPeer.set(peer, next);
      }
      continue;
    }
    if (dialog.kind === "room" && dialog.roomId) {
      const roomId = dialog.roomId.toUpperCase();
      const canonicalId = `room:${roomId}`;
      const prev = roomById.get(roomId);
      const next: LocalDialog = { ...dialog, id: canonicalId, roomId };
      if (!prev || next.createdAt >= prev.createdAt) {
        roomById.set(roomId, next);
      }
      continue;
    }
    other.push(dialog);
  }

  return [...other, ...dmByPeer.values(), ...roomById.values()];
}

export function removeLocalDialogsForPeer(peerPhone: string, myPhone: string): void {
  const peer = normalizeKzPhone(peerPhone);
  const me = normalizeKzPhone(myPhone);
  const next = loadLocalDialogs().filter((d) => {
    if (d.kind !== "dm" || !d.peerPhone) return true;
    return normalizeKzPhone(d.peerPhone) !== peer;
  });
  saveLocalDialogs(dedupeDialogsByRecipient(next, me));
}

export async function deleteLocalDialog(
  dialog: LocalDialog,
  myPhone: string,
  storageKey?: CryptoKey | null,
): Promise<void> {
  if (dialog.kind === "dm" && dialog.peerPhone) {
    const peer = normalizeKzPhone(dialog.peerPhone);
    const canonicalId = deriveDmChatId(myPhone, peer);
    removeLocalDialogsForPeer(peer, myPhone);
    if (storageKey) {
      await clearChatHistory(canonicalId);
      const reversed = canonicalDmChatId(`dm:${peer}:${normalizeKzPhone(myPhone)}`);
      if (reversed && reversed !== canonicalId) {
        await clearChatHistory(reversed);
      }
    }
    return;
  }
  if (dialog.kind === "room" && dialog.roomId) {
    await cleanupRoomLocalState(dialog.roomId);
    return;
  }
  removeLocalDialog(dialog.id);
}

export async function hideMessengerDialog(
  dialog: LocalDialog,
  myPhone: string,
  storageKey?: CryptoKey | null,
): Promise<{ ok: boolean; error?: string }> {
  if (dialog.kind === "room" && dialog.roomId) {
    const left = (await leaveRoomApi(dialog.roomId)) as { ok?: boolean; error?: string };
    if (!left.ok) {
      return { ok: false, error: left.error ?? "Не удалось покинуть комнату" };
    }
  } else {
    const res = await deleteMessengerDialog(dialog.id);
    if (!res.ok) {
      return { ok: false, error: res.error ?? "Не удалось удалить диалог" };
    }
  }
  await deleteLocalDialog(dialog, myPhone, storageKey);
  return { ok: true };
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
