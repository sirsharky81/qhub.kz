import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";
import { FORBIDDEN_KEY_PARTS } from "./constants";

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubShareMem?: MemoryStore };
  if (!g.__qhubShareMem) g.__qhubShareMem = new Map();
  return g.__qhubShareMem;
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

export function getShareRedis(): { kind: "configured" } | null {
  return hasRedisBackend() ? { kind: "configured" } : null;
}

export function assertAllowedRedisKey(key: string): void {
  if (!key.startsWith("share:")) {
    throw new Error("invalid_key_prefix");
  }
  for (const part of FORBIDDEN_KEY_PARTS) {
    if (key.includes(`:${part}`) || key.endsWith(`:${part}`)) {
      throw new Error("forbidden_key");
    }
  }
}

export { parseRedisJsonValue };

export async function shareRedisGet(key: string): Promise<string | null> {
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

export async function shareRedisGetJson<T>(key: string): Promise<T | null> {
  const raw = await shareRedisGet(key);
  return raw ? parseRedisJsonValue<T>(raw) : null;
}

export async function shareRedisSet(key: string, value: string, exSeconds?: number): Promise<void> {
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

export async function shareRedisDel(...keys: string[]): Promise<void> {
  for (const key of keys) assertAllowedRedisKey(key);
  if (hasRedisBackend()) {
    if (keys.length) await core.redisDel(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}

export async function shareRedisIncr(key: string): Promise<number> {
  assertAllowedRedisKey(key);
  if (hasRedisBackend()) return core.redisIncr(key);
  const current = Number((await shareRedisGet(key)) ?? "0");
  const next = current + 1;
  await shareRedisSet(key, String(next));
  return next;
}

export async function shareRedisLpush(key: string, value: string): Promise<void> {
  assertAllowedRedisKey(key);
  if (hasRedisBackend()) {
    await core.redisLpush(key, value);
    return;
  }
  const raw = (await shareRedisGet(key)) ?? "[]";
  let list: string[];
  try {
    list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.unshift(value);
  await shareRedisSet(key, JSON.stringify(list.slice(0, 500)));
}

export async function shareRedisLrange(key: string, start: number, stop: number): Promise<string[]> {
  assertAllowedRedisKey(key);
  if (hasRedisBackend()) return core.redisLrange(key, start, stop);
  const raw = await shareRedisGet(key);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) return [];
    const normalized = [...list].reverse();
    return normalized.slice(start, stop + 1);
  } catch {
    return [];
  }
}
