import { Redis } from "@upstash/redis";
import { FORBIDDEN_KEY_PARTS } from "./constants";

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

export function getFamilyRedis(): Redis | null {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;
  return new Redis({ url, token });
}

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

export function parseRedisJsonValue<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

export async function familyRedisGet(key: string): Promise<string | null> {
  assertAllowedRedisKey(key);
  const redis = getFamilyRedis();
  if (redis) {
    const raw = await redis.get(key);
    if (raw == null) return null;
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  }
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
  const redis = getFamilyRedis();
  if (redis) {
    if (exSeconds) {
      await redis.set(key, value, { ex: exSeconds });
    } else {
      await redis.set(key, value);
    }
    return;
  }
  memoryStore().set(key, {
    value,
    expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : null,
  });
}

export async function familyRedisDel(...keys: string[]): Promise<void> {
  for (const key of keys) assertAllowedRedisKey(key);
  const redis = getFamilyRedis();
  if (redis) {
    if (keys.length) await redis.del(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}
