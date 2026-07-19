import type { KzPlace, KzPlaceCategory } from "./types";
import {
  REDIS_KZ_MAPS_PENDING_PREFIX,
  REDIS_KZ_MAPS_PENDING_LIST,
} from "./constants";
import { isRedisConfigured } from "@/lib/redis/env";
import {
  redisGetJson,
  redisKeys,
  redisLpush,
  redisLrange,
  redisLrem,
  redisMget,
  redisSet,
} from "@/lib/redis/commands";

export interface PendingPlaceSuggestion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  category: KzPlaceCategory;
  summary: string;
  submitterName?: string;
  submitterContact?: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

export async function savePendingSuggestion(
  data: Omit<PendingPlaceSuggestion, "id" | "createdAt" | "status">,
): Promise<PendingPlaceSuggestion> {
  if (!isRedisConfigured()) {
    throw new Error("redis_unavailable");
  }

  const id = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingPlaceSuggestion = {
    ...data,
    id,
    createdAt: Date.now(),
    status: "pending",
  };

  const key = `${REDIS_KZ_MAPS_PENDING_PREFIX}${id}`;
  await redisSet(key, JSON.stringify(entry), 90 * 24 * 3600);
  await redisLpush(REDIS_KZ_MAPS_PENDING_LIST, id);
  return entry;
}

export async function listPendingSuggestions(): Promise<PendingPlaceSuggestion[]> {
  if (!isRedisConfigured()) return [];

  const ids = await redisLrange(REDIS_KZ_MAPS_PENDING_LIST, 0, 199);
  const out: PendingPlaceSuggestion[] = [];

  for (const id of ids) {
    const key = `${REDIS_KZ_MAPS_PENDING_PREFIX}${id}`;
    const item = await redisGetJson<PendingPlaceSuggestion>(key);
    if (item && item.status === "pending") out.push(item);
  }

  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updatePendingStatus(
  id: string,
  status: "approved" | "rejected",
): Promise<PendingPlaceSuggestion | null> {
  if (!isRedisConfigured()) return null;

  const key = `${REDIS_KZ_MAPS_PENDING_PREFIX}${id}`;
  const item = await redisGetJson<PendingPlaceSuggestion>(key);
  if (!item) return null;

  const updated = { ...item, status } as PendingPlaceSuggestion;
  await redisSet(key, JSON.stringify(updated), 90 * 24 * 3600);
  if (status === "rejected" || status === "approved") {
    await redisLrem(REDIS_KZ_MAPS_PENDING_LIST, 0, id);
  }
  return updated;
}

/** Approved community places stored in Redis (published via admin). */
export async function saveCommunityPlace(place: KzPlace): Promise<void> {
  if (!isRedisConfigured()) return;
  const key = `qhub:kz-maps:place:${place.id}`;
  await redisSet(key, JSON.stringify(place));
}

export async function listCommunityPlaces(): Promise<KzPlace[]> {
  if (!isRedisConfigured()) return [];
  const keys = await redisKeys("qhub:kz-maps:place:*");
  if (keys.length === 0) return [];
  const values = await redisMget(...keys);
  const out: KzPlace[] = [];
  for (const raw of values) {
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as KzPlace);
    } catch {
      /* skip */
    }
  }
  return out.filter((p) => p.published);
}
