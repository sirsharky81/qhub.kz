import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";
import { CAST_REDIS_PREFIX } from "./constants";

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubCastMem?: MemoryStore };
  if (!g.__qhubCastMem) g.__qhubCastMem = new Map();
  return g.__qhubCastMem;
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

export function assertAllowedCastRedisKey(key: string): void {
  if (!key.startsWith(CAST_REDIS_PREFIX)) {
    throw new Error("invalid_cast_key_prefix");
  }
}

export { parseRedisJsonValue };

export async function castRedisGet(key: string): Promise<string | null> {
  assertAllowedCastRedisKey(key);
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

export async function castRedisGetJson<T>(key: string): Promise<T | null> {
  const raw = await castRedisGet(key);
  return raw ? parseRedisJsonValue<T>(raw) : null;
}

export async function castRedisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  assertAllowedCastRedisKey(key);
  if (hasRedisBackend()) {
    await core.redisSet(key, value, exSeconds);
    return;
  }
  memoryStore().set(key, {
    value,
    expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : null,
  });
}

export async function castRedisDel(...keys: string[]): Promise<void> {
  for (const key of keys) assertAllowedCastRedisKey(key);
  if (hasRedisBackend()) {
    if (keys.length) await core.redisDel(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}

export async function castRedisSetNx(
  key: string,
  value: string,
  exSeconds: number,
): Promise<boolean> {
  assertAllowedCastRedisKey(key);
  const existing = await castRedisGet(key);
  if (existing !== null) return false;
  await castRedisSet(key, value, exSeconds);
  return true;
}
