import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(prefix: string): MemoryStore {
  const key = `__qhubRoomCoreMem_${prefix}`;
  const g = globalThis as typeof globalThis & Record<string, MemoryStore | undefined>;
  if (!g[key]) g[key] = new Map();
  return g[key]!;
}

function purgeExpiredMemory(store: MemoryStore): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt != null && entry.expiresAt <= now) store.delete(key);
  }
}

export function createRoomCoreRedis(redisPrefix: string) {
  function assertKey(key: string): void {
    if (!key.startsWith(redisPrefix)) throw new Error("invalid_key_prefix");
  }

  function hasRedisBackend(): boolean {
    return getRedisBackend() !== null;
  }

  const mem = memoryStore(redisPrefix.replace(/:/g, "_"));

  return {
    async get(key: string): Promise<string | null> {
      assertKey(key);
      if (hasRedisBackend()) return core.redisGet(key);
      purgeExpiredMemory(mem);
      const entry = mem.get(key);
      if (!entry) return null;
      if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
        mem.delete(key);
        return null;
      }
      return entry.value;
    },

    async getJson<T>(key: string): Promise<T | null> {
      const raw = await this.get(key);
      return raw ? parseRedisJsonValue<T>(raw) : null;
    },

    async set(key: string, value: string, exSeconds?: number): Promise<void> {
      assertKey(key);
      if (hasRedisBackend()) {
        await core.redisSet(key, value, exSeconds);
        return;
      }
      mem.set(key, { value, expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : null });
    },

    async del(...keys: string[]): Promise<void> {
      for (const k of keys) assertKey(k);
      if (hasRedisBackend()) {
        if (keys.length) await core.redisDel(...keys);
        return;
      }
      for (const k of keys) mem.delete(k);
    },

    async incr(key: string): Promise<number> {
      assertKey(key);
      if (hasRedisBackend()) return core.redisIncr(key);
      const current = Number((await this.get(key)) ?? "0");
      const next = current + 1;
      await this.set(key, String(next));
      return next;
    },

    async publish(channel: string, message: string): Promise<void> {
      await core.redisPublish(channel, message);
    },
  };
}

export type RoomCoreRedis = ReturnType<typeof createRoomCoreRedis>;
