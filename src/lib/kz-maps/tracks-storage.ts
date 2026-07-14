import type { StoredTrack } from "./gpx";

const STORAGE_KEY = "qhub_kz_maps_tracks";

function readAll(): StoredTrack[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTrack[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(tracks: StoredTrack[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

export function listStoredTracks(): StoredTrack[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getStoredTrack(id: string): StoredTrack | null {
  return readAll().find((t) => t.id === id) ?? null;
}

export function saveStoredTrack(track: StoredTrack): void {
  const all = readAll().filter((t) => t.id !== track.id);
  all.push(track);
  writeAll(all);
}

export function deleteStoredTrack(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}

export function newTrackId(): string {
  return `trk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
