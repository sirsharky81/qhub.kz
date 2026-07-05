import { getRedisBackend } from "./env";
import { getTcpClient, serializeTcpValue } from "./tcp";
import { getUpstashClient } from "./upstash";

export { getRedisBackend, isRedisConfigured } from "./env";

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

function normalizeUpstashValue(raw: unknown): string | null {
  if (raw == null) return null;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

export async function redisGet(key: string): Promise<string | null> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return null;
    return serializeTcpValue(await client.get(key));
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return null;
    return normalizeUpstashValue(await client.get(key));
  }
  return null;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const raw = await redisGet(key);
    return raw ? parseRedisJsonValue<T>(raw) : null;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return null;
    return parseRedisJsonValue<T>(await client.get(key));
  }
  return null;
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    if (exSeconds) {
      await client.set(key, value, "EX", exSeconds);
    } else {
      await client.set(key, value);
    }
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    if (exSeconds) {
      await client.set(key, value, { ex: exSeconds });
    } else {
      await client.set(key, value);
    }
  }
}

export async function redisDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    await client.del(...keys);
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    await client.del(...keys);
  }
}

export async function redisLpush(key: string, ...values: string[]): Promise<void> {
  if (!values.length) return;
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    await client.lpush(key, ...values);
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    await client.lpush(key, ...values);
  }
}

export async function redisLrange(key: string, start: number, stop: number): Promise<string[]> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return [];
    const raw = await client.lrange(key, start, stop);
    return raw.map((item) => (typeof item === "string" ? item : String(item)));
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return [];
    const raw = await client.lrange(key, start, stop);
    return (raw ?? []).map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }
  return [];
}

export async function redisLrem(key: string, count: number, value: string): Promise<void> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    await client.lrem(key, count, value);
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    await client.lrem(key, count, value);
  }
}

export async function redisLtrim(key: string, start: number, stop: number): Promise<void> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    await client.ltrim(key, start, stop);
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    await client.ltrim(key, start, stop);
  }
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return;
    await client.expire(key, seconds);
    return;
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return;
    await client.expire(key, seconds);
  }
}

export async function redisIncr(key: string): Promise<number> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return 0;
    return client.incr(key);
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return 0;
    const next = await client.incr(key);
    return typeof next === "number" ? next : Number(next);
  }
  return 0;
}

export async function redisKeys(pattern: string): Promise<string[]> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return [];
    return client.keys(pattern);
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return [];
    const keys = await client.keys(pattern);
    return Array.isArray(keys) ? keys : [];
  }
  return [];
}

export async function redisMget(...keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return keys.map(() => null);
    const raw = await client.mget(...keys);
    return raw.map((item) => serializeTcpValue(item));
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return keys.map(() => null);
    const raw = await client.mget<string[]>(...keys);
    if (!Array.isArray(raw)) return keys.map(() => null);
    return raw.map((item) => normalizeUpstashValue(item));
  }
  return keys.map(() => null);
}

export async function redisPing(): Promise<boolean> {
  const backend = getRedisBackend();
  if (backend === "tcp") {
    const client = getTcpClient();
    if (!client) return false;
    try {
      return (await client.ping()) === "PONG";
    } catch {
      return false;
    }
  }
  if (backend === "upstash") {
    const client = getUpstashClient();
    if (!client) return false;
    try {
      await client.get("qhub:redis:ping");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
