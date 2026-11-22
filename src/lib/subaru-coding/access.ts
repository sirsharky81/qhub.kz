import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { redisDel, redisGetJson, redisSet } from "@/lib/messenger/redis";

export const SUBARU_CODING_WHITELIST_KEY = "qhub:subaru-coding:whitelist";

export type SubaruCodingAccessStatus = "active" | "blocked";

export interface SubaruCodingWhitelistEntry {
  phone: string;
  addedBy: string;
  addedAt: number;
  status: SubaruCodingAccessStatus;
  note: string;
}

const CACHE_TTL_MS = 15_000;
let cache: { at: number; data: Record<string, SubaruCodingWhitelistEntry> } | null = null;

export function clearSubaruCodingWhitelistCache(): void {
  cache = null;
}

export async function loadSubaruCodingWhitelist(): Promise<Record<string, SubaruCodingWhitelistEntry>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await redisGetJson<Record<string, SubaruCodingWhitelistEntry>>(SUBARU_CODING_WHITELIST_KEY);
  const next = data ?? {};
  cache = { at: Date.now(), data: next };
  return next;
}

export async function saveSubaruCodingWhitelist(
  data: Record<string, SubaruCodingWhitelistEntry>,
): Promise<void> {
  await redisSet(SUBARU_CODING_WHITELIST_KEY, JSON.stringify(data));
  cache = { at: Date.now(), data };
}

export async function removeSubaruCodingWhitelistEntry(phone: string): Promise<boolean> {
  const all = await loadSubaruCodingWhitelist();
  if (!all[phone]) return false;
  delete all[phone];
  if (Object.keys(all).length === 0) {
    await redisDel(SUBARU_CODING_WHITELIST_KEY);
    cache = { at: Date.now(), data: {} };
    return true;
  }
  await saveSubaruCodingWhitelist(all);
  return true;
}

/** Active whitelist entry only. An empty list or a blocked number is denied. */
export async function isSubaruCodingPhoneAllowed(rawPhone: string): Promise<boolean> {
  const phone = normalizeKzPhone(rawPhone);
  if (!isValidKzPhone(phone)) return false;
  const entry = (await loadSubaruCodingWhitelist())[phone];
  return entry?.status === "active";
}
