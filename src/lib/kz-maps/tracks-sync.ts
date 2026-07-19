import type { StoredTrack } from "./gpx";
import { getKzMapsDeviceId } from "./device-id";
import { PlatformOfflineQueue } from "@/lib/platform/offlineQueue";

const SYNCED_KEY = "qhub_kz_maps_tracks_synced";

function readSynced(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SYNCED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSynced(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...ids]));
}

export async function syncTrackToServer(
  track: StoredTrack,
  opts?: { isPublic?: boolean; region?: string },
): Promise<void> {
  const deviceId = getKzMapsDeviceId();
  const payload = {
    id: track.id,
    name: track.name,
    region: opts?.region,
    distanceM: track.distanceM,
    durationSec: track.durationSec,
    pointCount: track.gpx.match(/<trkpt/gi)?.length ?? 0,
    gpx: track.gpx,
    isPublic: opts?.isPublic ?? false,
    createdAt: track.createdAt,
  };

  await PlatformOfflineQueue.enqueue({
    type: "kz-maps-track-upload",
    endpoint: "/api/kz-maps/my/tracks",
    payload,
    headers: {
      "Content-Type": "application/json",
      "X-Kz-Maps-Device-Id": deviceId,
    },
  });

  const synced = readSynced();
  synced.add(track.id);
  writeSynced(synced);
}

export function isTrackSynced(id: string): boolean {
  return readSynced().has(id);
}

export async function fetchPublicTracks(): Promise<
  Array<{ id: string; name: string; distanceM: number; region?: string }>
> {
  const res = await fetch("/api/kz-maps/my/tracks?public=1");
  if (!res.ok) return [];
  const data = (await res.json()) as { tracks?: Array<{ id: string; name: string; distanceM: number; region?: string }> };
  return data.tracks ?? [];
}
