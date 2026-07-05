import * as core from "@/lib/redis/commands";
import { getRedisBackend } from "@/lib/redis/env";
import type { HeartsRoomRecord } from "./types";

const ROOM_TTL_SEC = 60 * 60 * 24;
const REDIS_PREFIX = "qhub:hearts:room:";

type RoomMap = Map<string, HeartsRoomRecord>;

function memoryStore(): RoomMap {
  const g = globalThis as typeof globalThis & { __qhubHeartsRooms?: RoomMap };
  if (!g.__qhubHeartsRooms) g.__qhubHeartsRooms = new Map();
  return g.__qhubHeartsRooms;
}

function roomKey(code: string): string {
  return `${REDIS_PREFIX}${code.toUpperCase()}`;
}

export async function getHeartsRoom(code: string): Promise<HeartsRoomRecord | null> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    const raw = await core.redisGet(roomKey(normalized));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as HeartsRoomRecord;
    } catch {
      return null;
    }
  }
  return memoryStore().get(normalized) ?? null;
}

export async function saveHeartsRoom(room: HeartsRoomRecord): Promise<void> {
  const normalized = room.roomCode.toUpperCase();
  room.roomCode = normalized;
  if (getRedisBackend()) {
    await core.redisSet(roomKey(normalized), JSON.stringify(room), ROOM_TTL_SEC);
    return;
  }
  memoryStore().set(normalized, room);
}

export async function deleteHeartsRoom(code: string): Promise<void> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    await core.redisDel(roomKey(normalized));
    return;
  }
  memoryStore().delete(normalized);
}

export async function listHeartsRooms(): Promise<HeartsRoomRecord[]> {
  if (getRedisBackend()) {
    const keys = await core.redisKeys(`${REDIS_PREFIX}*`);
    if (!keys.length) return [];
    const values = await core.redisMget(...keys);
    return values
      .map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as HeartsRoomRecord;
        } catch {
          return null;
        }
      })
      .filter((item): item is HeartsRoomRecord => Boolean(item));
  }
  return [...memoryStore().values()];
}
