import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@/lib/redis/commands";
import { getRedisBackend } from "@/lib/redis/env";
import {
  DEFAULT_ADMIN_PASSWORD,
  REDIS_HIDDEN_APPS_KEY,
  REDIS_PASSWORD_HASH_KEY,
} from "./constants";
import { hashPassword } from "./password";

interface AdminStoreData {
  passwordHash: string;
  hiddenAppIds: string[];
}

const FILE_PATH = join(process.cwd(), ".data", "admin-store.json");

async function readFileStore(): Promise<AdminStoreData | null> {
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as AdminStoreData;
  } catch {
    return null;
  }
}

async function writeFileStore(data: AdminStoreData): Promise<void> {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function defaultStore(): Promise<AdminStoreData> {
  return {
    passwordHash: await hashPassword(DEFAULT_ADMIN_PASSWORD),
    hiddenAppIds: [],
  };
}

async function loadStore(): Promise<AdminStoreData> {
  if (getRedisBackend()) {
    const [hash, hiddenRaw] = await Promise.all([
      core.redisGet(REDIS_PASSWORD_HASH_KEY),
      core.redisGet(REDIS_HIDDEN_APPS_KEY),
    ]);
    if (hash) {
      let hiddenAppIds: string[] = [];
      if (hiddenRaw) {
        try {
          hiddenAppIds = JSON.parse(hiddenRaw) as string[];
        } catch {
          hiddenAppIds = [];
        }
      }
      return { passwordHash: hash, hiddenAppIds };
    }
    const init = await defaultStore();
    await saveStore(init);
    return init;
  }

  const file = await readFileStore();
  if (file?.passwordHash) return file;
  const init = await defaultStore();
  await writeFileStore(init);
  return init;
}

async function saveStore(data: AdminStoreData): Promise<void> {
  if (getRedisBackend()) {
    await Promise.all([
      core.redisSet(REDIS_PASSWORD_HASH_KEY, data.passwordHash),
      core.redisSet(REDIS_HIDDEN_APPS_KEY, JSON.stringify(data.hiddenAppIds)),
    ]);
    return;
  }
  await writeFileStore(data);
}

export async function getPasswordHash(): Promise<string> {
  const store = await loadStore();
  return store.passwordHash;
}

export async function setPasswordHash(hash: string): Promise<void> {
  const store = await loadStore();
  store.passwordHash = hash;
  await saveStore(store);
}

export async function getHiddenAppIds(): Promise<string[]> {
  const store = await loadStore();
  return store.hiddenAppIds;
}

export async function setHiddenAppIds(ids: string[]): Promise<void> {
  const store = await loadStore();
  store.hiddenAppIds = ids;
  await saveStore(store);
}

export async function toggleAppHidden(appId: string, hidden: boolean): Promise<string[]> {
  const store = await loadStore();
  const set = new Set(store.hiddenAppIds);
  if (hidden) set.add(appId);
  else set.delete(appId);
  store.hiddenAppIds = [...set];
  await saveStore(store);
  return store.hiddenAppIds;
}
