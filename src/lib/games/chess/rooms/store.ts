import * as core from "@/lib/redis/commands";
import { getRedisBackend } from "@/lib/redis/env";
import type { ChessRoomRecord } from "./types";

const ROOM_TTL_SEC = 60 * 60 * 24;
const REDIS_PREFIX = "qhub:chess:room:";

type RoomMap = Map<string, ChessRoomRecord>;

function memoryStore(): RoomMap {
  const g = globalThis as typeof globalThis & { __qhubChessRooms?: RoomMap };
  if (!g.__qhubChessRooms) g.__qhubChessRooms = new Map();
  return g.__qhubChessRooms;
}

function roomKey(code: string): string {
  return `${REDIS_PREFIX}${code.toUpperCase()}`;
}

export async function getChessRoom(code: string): Promise<ChessRoomRecord | null> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    const raw = await core.redisGet(roomKey(normalized));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ChessRoomRecord;
    } catch {
      return null;
    }
  }
  return memoryStore().get(normalized) ?? null;
}

export async function saveChessRoom(room: ChessRoomRecord): Promise<void> {
  const normalized = room.roomCode.toUpperCase();
  room.roomCode = normalized;
  if (getRedisBackend()) {
    await core.redisSet(roomKey(normalized), JSON.stringify(room), ROOM_TTL_SEC);
    return;
  }
  memoryStore().set(normalized, room);
}

export async function deleteChessRoom(code: string): Promise<void> {
  const normalized = code.toUpperCase();
  if (getRedisBackend()) {
    await core.redisDel(roomKey(normalized));
    return;
  }
  memoryStore().delete(normalized);
}
