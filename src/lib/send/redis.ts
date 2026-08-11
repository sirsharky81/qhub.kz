import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";
import { FORBIDDEN_KEY_PARTS, SEND_REDIS_PREFIX } from "./constants";

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubSendMem?: MemoryStore };
  if (!g.__qhubSendMem) g.__qhubSendMem = new Map();
  return g.__qhubSendMem;
}

function purgeExpiredMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore()) {
    if (entry.expiresAt != null && entry.expiresAt <= now) {
      memoryStore().delete(key);
    }
  }
}

function hasRedisBackend(): boolean {
  return getRedisBackend() !== null;
}

export function assertAllowedRedisKey(key: string): void {
  if (!key.startsWith(SEND_REDIS_PREFIX)) {
    throw new Error("invalid_key_prefix");
  }
  for (const part of FORBIDDEN_KEY_PARTS) {
    if (key.includes(`:${part}`) || key.endsWith(`:${part}`)) {
      throw new Error("forbidden_key");
    }
  }
}

export { parseRedisJsonValue };

export async function sendRedisGet(key: string): Promise<string | null> {
  assertAllowedRedisKey(key);
  if (hasRedisBackend()) return core.redisGet(key);
  purgeExpiredMemory();
  const entry = memoryStore().get(key);
  if (!entry) return null;
  if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
    memoryStore().delete(key);
    return null;
  }
  return entry.value;
}

export async function sendRedisGetJson<T>(key: string): Promise<T | null> {
  const raw = await sendRedisGet(key);
  return raw ? parseRedisJsonValue<T>(raw) : null;
}

export async function sendRedisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  assertAllowedRedisKey(key);
  if (hasRedisBackend()) {
    await core.redisSet(key, value, exSeconds);
    return;
  }
  memoryStore().set(key, {
    value,
    expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : null,
  });
}

export async function sendRedisDel(...keys: string[]): Promise<void> {
  for (const key of keys) assertAllowedRedisKey(key);
  if (hasRedisBackend()) {
    if (keys.length) await core.redisDel(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}
