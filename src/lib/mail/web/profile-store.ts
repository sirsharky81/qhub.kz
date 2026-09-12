import * as core from "@/lib/redis/commands";
import { getRedisBackend, parseRedisJsonValue } from "@/lib/redis/commands";

export const MAIL_PROFILE_REDIS_PREFIX = "qhub:mail:profile:";

export interface MailProfile {
  email: string;
  fullName: string;
  phone: string;
  signature: string;
  updatedAt: number;
}

type MemoryEntry = { value: string; expiresAt: number | null };
type MemoryStore = Map<string, MemoryEntry>;

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __qhubMailProfileMem?: MemoryStore };
  if (!g.__qhubMailProfileMem) g.__qhubMailProfileMem = new Map();
  return g.__qhubMailProfileMem;
}

function profileKey(email: string): string {
  return `${MAIL_PROFILE_REDIS_PREFIX}${email.trim().toLowerCase()}`;
}

function hasRedisBackend(): boolean {
  return getRedisBackend() !== null;
}

async function profileGet(key: string): Promise<string | null> {
  if (hasRedisBackend()) return core.redisGet(key);
  const entry = memoryStore().get(key);
  return entry?.value ?? null;
}

async function profileSet(key: string, value: string): Promise<void> {
  if (hasRedisBackend()) {
    await core.redisSet(key, value);
    return;
  }
  memoryStore().set(key, { value, expiresAt: null });
}

export async function getMailProfile(email: string): Promise<MailProfile | null> {
  const raw = await profileGet(profileKey(email));
  return raw ? parseRedisJsonValue<MailProfile>(raw) : null;
}

export async function saveMailProfile(profile: MailProfile): Promise<void> {
  await profileSet(profileKey(profile.email), JSON.stringify(profile));
}
