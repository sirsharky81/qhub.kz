import { Redis } from "@upstash/redis";
import type { HeartsRoomRecord } from "./types";

const ROOM_TTL_SEC = 60 * 60 * 24;
const REDIS_PREFIX = "qhub:hearts:room:";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
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
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<string>(roomKey(normalized));
    if (!raw) return null;
    try {
      return typeof raw === "string"
        ? (JSON.parse(raw) as HeartsRoomRecord)
        : (raw as HeartsRoomRecord);
    } catch {
      return null;
    }
  }
  return memoryStore().get(normalized) ?? null;
}

export async function saveHeartsRoom(room: HeartsRoomRecord): Promise<void> {
  const normalized = room.roomCode.toUpperCase();
  room.roomCode = normalized;
  const redis = getRedis();
  if (redis) {
    await redis.set(roomKey(normalized), JSON.stringify(room), { ex: ROOM_TTL_SEC });
    return;
  }
  memoryStore().set(normalized, room);
}

export async function deleteHeartsRoom(code: string): Promise<void> {
  const normalized = code.toUpperCase();
  const redis = getRedis();
  if (redis) {
    await redis.del(roomKey(normalized));
    return;
  }
  memoryStore().delete(normalized);
}

export async function listHeartsRooms(): Promise<HeartsRoomRecord[]> {
  const redis = getRedis();
  if (redis) {
    const keys = await redis.keys(`${REDIS_PREFIX}*`);
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const values = await redis.mget<string[]>(...keys);
    return values
      .map((value) => {
        if (!value) return null;
        try {
          return typeof value === "string"
            ? (JSON.parse(value) as HeartsRoomRecord)
            : (value as HeartsRoomRecord);
        } catch {
          return null;
        }
      })
      .filter((item): item is HeartsRoomRecord => Boolean(item));
  }
  return [...memoryStore().values()];
}
