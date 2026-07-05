import * as core from "@/lib/redis/commands";
import { getRedisBackend } from "@/lib/redis/env";
import type { LottoRoomRecord } from "./types";

const ROOM_TTL_SEC = 60 * 60 * 24;
const REDIS_PREFIX = "qhub:lotto:room:";

type RoomMap = Map<string, LottoRoomRecord>;

function memoryStore(): RoomMap {
  const g = globalThis as typeof globalThis & { __qhubLottoRooms?: RoomMap };
  if (!g.__qhubLottoRooms) g.__qhubLottoRooms = new Map();
  return g.__qhubLottoRooms;
}

function roomKey(code: string): string {
  return `${REDIS_PREFIX}${code.toUpperCase()}`;
}

export async function getRoom(code: string): Promise<LottoRoomRecord | null> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    const raw = await core.redisGet(roomKey(normalized));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LottoRoomRecord;
    } catch {
      return null;
    }
  }
  return memoryStore().get(normalized) ?? null;
}

export async function saveRoom(room: LottoRoomRecord): Promise<void> {
  const normalized = room.roomCode.toUpperCase();
  room.roomCode = normalized;
  if (getRedisBackend()) {
    await core.redisSet(roomKey(normalized), JSON.stringify(room), ROOM_TTL_SEC);
    return;
  }
  memoryStore().set(normalized, room);
}

export async function deleteRoom(code: string): Promise<void> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    await core.redisDel(roomKey(normalized));
    return;
  }
  memoryStore().delete(normalized);
}
