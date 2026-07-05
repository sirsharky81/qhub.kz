import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";
import { FORBIDDEN_KEY_PARTS } from "./constants";

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubFamilyMem?: MemoryStore };
  if (!g.__qhubFamilyMem) g.__qhubFamilyMem = new Map();
  return g.__qhubFamilyMem;
}

function purgeExpiredMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore()) {
    if (entry.expiresAt != null && entry.expiresAt <= now) {
      memoryStore().delete(key);
    }
  }
}

function useRedis(): boolean {
  return getRedisBackend() !== null;
}

export function getFamilyRedis(): { kind: "configured" } | null {
  return useRedis() ? { kind: "configured" } : null;
}

export function assertAllowedRedisKey(key: string): void {
  if (!key.startsWith("family:")) {
    throw new Error("invalid_key_prefix");
  }
  for (const part of FORBIDDEN_KEY_PARTS) {
    if (key.includes(`:${part}`) || key.endsWith(`:${part}`)) {
      throw new Error("forbidden_key");
    }
  }
}

export { parseRedisJsonValue };

export async function familyRedisGet(key: string): Promise<string | null> {
  assertAllowedRedisKey(key);
  if (useRedis()) return core.redisGet(key);
  purgeExpiredMemory();
  const entry = memoryStore().get(key);
  if (!entry) return null;
  if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
    memoryStore().delete(key);
    return null;
  }
  return entry.value;
}

export async function familyRedisGetJson<T>(key: string): Promise<T | null> {
  const raw = await familyRedisGet(key);
  return raw ? parseRedisJsonValue<T>(raw) : null;
}

export async function familyRedisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  assertAllowedRedisKey(key);
  if (useRedis()) {
    await core.redisSet(key, value, exSeconds);
    return;
  }
  memoryStore().set(key, {
    value,
    expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : null,
  });
}

export async function familyRedisDel(...keys: string[]): Promise<void> {
  for (const key of keys) assertAllowedRedisKey(key);
  if (useRedis()) {
    if (keys.length) await core.redisDel(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}
