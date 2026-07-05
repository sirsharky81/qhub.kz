import * as core from "@/lib/redis/commands";
import { getRedisBackend, isRedisConfigured, parseRedisJsonValue } from "@/lib/redis/commands";

export { isRedisConfigured, parseRedisJsonValue };

/** @deprecated Use isRedisConfigured() — kept for legacy health checks. */
export function getMessengerRedis(): { kind: "configured" } | null {
  return isRedisConfigured() ? { kind: "configured" } : null;
}

type MemoryStore = Map<string, string>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubMessengerMem?: MemoryStore };
  if (!g.__qhubMessengerMem) g.__qhubMessengerMem = new Map();
  return g.__qhubMessengerMem;
}

function useRedis(): boolean {
  return getRedisBackend() !== null;
}

export async function redisGet(key: string): Promise<string | null> {
  if (useRedis()) return core.redisGet(key);
  return memoryStore().get(key) ?? null;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  if (useRedis()) return core.redisGetJson<T>(key);
  const mem = memoryStore().get(key);
  return mem ? parseRedisJsonValue<T>(mem) : null;
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  if (useRedis()) {
    await core.redisSet(key, value, exSeconds);
    return;
  }
  memoryStore().set(key, value);
}

export async function redisDel(...keys: string[]): Promise<void> {
  if (useRedis()) {
    if (keys.length) await core.redisDel(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}

export async function redisLpush(key: string, ...values: string[]): Promise<void> {
  if (useRedis()) {
    await core.redisLpush(key, ...values);
    return;
  }
  const mem = memoryStore();
  const existing = mem.get(key);
  const list: string[] = existing ? (JSON.parse(existing) as string[]) : [];
  list.unshift(...values);
  mem.set(key, JSON.stringify(list));
}

export async function redisLrange(key: string, start: number, stop: number): Promise<string[]> {
  if (useRedis()) return core.redisLrange(key, start, stop);
  const existing = memoryStore().get(key);
  if (!existing) return [];
  const list = JSON.parse(existing) as string[];
  const end = stop < 0 ? list.length + stop + 1 : stop + 1;
  return list.slice(start, end);
}

export async function redisLrem(key: string, count: number, value: string): Promise<void> {
  if (useRedis()) {
    await core.redisLrem(key, count, value);
    return;
  }
  const mem = memoryStore();
  const existing = mem.get(key);
  if (!existing) return;
  let list = JSON.parse(existing) as string[];
  if (count === 0) {
    list = list.filter((v) => v !== value);
  } else {
    let removed = 0;
    list = list.filter((v) => {
      if (v === value && removed < Math.abs(count)) {
        removed++;
        return false;
      }
      return true;
    });
  }
  mem.set(key, JSON.stringify(list));
}

export async function redisLtrim(key: string, start: number, stop: number): Promise<void> {
  if (useRedis()) {
    await core.redisLtrim(key, start, stop);
    return;
  }
  const mem = memoryStore();
  const existing = mem.get(key);
  if (!existing) return;
  const list = JSON.parse(existing) as string[];
  const normalizedStart = Math.max(0, start);
  const normalizedStop = stop < 0 ? list.length + stop : stop;
  const endExclusive = Math.max(normalizedStart, normalizedStop + 1);
  mem.set(key, JSON.stringify(list.slice(normalizedStart, endExclusive)));
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  if (useRedis()) await core.redisExpire(key, seconds);
}

export async function redisIncr(key: string): Promise<number> {
  if (useRedis()) return core.redisIncr(key);
  const mem = memoryStore();
  const prev = Number(mem.get(key) ?? "0");
  const next = Number.isFinite(prev) ? prev + 1 : 1;
  mem.set(key, String(next));
  return next;
}
