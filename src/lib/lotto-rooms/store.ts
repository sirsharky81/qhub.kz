import { Redis } from "@upstash/redis";
import type { LottoRoomRecord } from "./types";

const ROOM_TTL_SEC = 60 * 60 * 24;
const REDIS_PREFIX = "qhub:lotto:room:";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getRedis(): Redis | null {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;
  return new Redis({ url, token });
}

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
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<string>(roomKey(normalized));
    if (!raw) return null;
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as LottoRoomRecord) : (raw as LottoRoomRecord);
    } catch {
      return null;
    }
  }
  return memoryStore().get(normalized) ?? null;
}

export async function saveRoom(room: LottoRoomRecord): Promise<void> {
  const normalized = room.roomCode.toUpperCase();
  room.roomCode = normalized;
  const redis = getRedis();
  if (redis) {
    await redis.set(roomKey(normalized), JSON.stringify(room), { ex: ROOM_TTL_SEC });
    return;
  }
  memoryStore().set(normalized, room);
}

export async function deleteRoom(code: string): Promise<void> {
  const normalized = code.toUpperCase();
  const redis = getRedis();
  if (redis) {
    await redis.del(roomKey(normalized));
    return;
  }
  memoryStore().delete(normalized);
}
