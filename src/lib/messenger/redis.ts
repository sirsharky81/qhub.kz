import { Redis } from "@upstash/redis";

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

export function getMessengerRedis(): Redis | null {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;
  return new Redis({ url, token });
}

type MemoryStore = Map<string, string>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubMessengerMem?: MemoryStore };
  if (!g.__qhubMessengerMem) g.__qhubMessengerMem = new Map();
  return g.__qhubMessengerMem;
}

/** Upstash may return JSON already parsed — normalize to string for legacy callers. */
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

export async function redisGet(key: string): Promise<string | null> {
  const redis = getMessengerRedis();
  if (redis) {
    const raw = await redis.get(key);
    if (raw == null) return null;
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  }
  return memoryStore().get(key) ?? null;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const redis = getMessengerRedis();
  if (redis) {
    return parseRedisJsonValue<T>(await redis.get(key));
  }
  const mem = memoryStore().get(key);
  return mem ? parseRedisJsonValue<T>(mem) : null;
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  const redis = getMessengerRedis();
  if (redis) {
    if (exSeconds) {
      await redis.set(key, value, { ex: exSeconds });
    } else {
      await redis.set(key, value);
    }
    return;
  }
  memoryStore().set(key, value);
}

export async function redisDel(...keys: string[]): Promise<void> {
  const redis = getMessengerRedis();
  if (redis) {
    if (keys.length) await redis.del(...keys);
    return;
  }
  for (const k of keys) memoryStore().delete(k);
}

export async function redisLpush(key: string, ...values: string[]): Promise<void> {
  const redis = getMessengerRedis();
  if (redis) {
    await redis.lpush(key, ...values);
    return;
  }
  const mem = memoryStore();
  const existing = mem.get(key);
  const list: string[] = existing ? (JSON.parse(existing) as string[]) : [];
  list.unshift(...values);
  mem.set(key, JSON.stringify(list));
}

export async function redisLrange(key: string, start: number, stop: number): Promise<string[]> {
  const redis = getMessengerRedis();
  if (redis) {
    const raw = await redis.lrange(key, start, stop);
    return (raw ?? []).map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }
  const existing = memoryStore().get(key);
  if (!existing) return [];
  const list = JSON.parse(existing) as string[];
  const end = stop < 0 ? list.length + stop + 1 : stop + 1;
  return list.slice(start, end);
}

export async function redisLrem(key: string, count: number, value: string): Promise<void> {
  const redis = getMessengerRedis();
  if (redis) {
    await redis.lrem(key, count, value);
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
  const redis = getMessengerRedis();
  if (redis) {
    await redis.ltrim(key, start, stop);
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
  const redis = getMessengerRedis();
  if (redis) {
    await redis.expire(key, seconds);
  }
}

export async function redisIncr(key: string): Promise<number> {
  const redis = getMessengerRedis();
  if (redis) {
    const next = await redis.incr(key);
    return typeof next === "number" ? next : Number(next);
  }
  const mem = memoryStore();
  const prev = Number(mem.get(key) ?? "0");
  const next = Number.isFinite(prev) ? prev + 1 : 1;
  mem.set(key, String(next));
  return next;
}
