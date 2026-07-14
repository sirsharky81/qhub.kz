import indexJson from "@/data/kz-places/index.json";
import almatyCityJson from "@/data/kz-places/almaty-city.json";
import almatyOblastJson from "@/data/kz-places/almaty-oblast.json";
import mangystauJson from "@/data/kz-places/mangystau.json";
import turkestanJson from "@/data/kz-places/turkestan.json";
import type { KzPlace, KzPlacesIndex } from "./types";

const REGION_FILES: Record<string, KzPlace[]> = {
  "almaty-city": almatyCityJson as KzPlace[],
  "almaty-oblast": almatyOblastJson as KzPlace[],
  mangystau: mangystauJson as KzPlace[],
  turkestan: turkestanJson as KzPlace[],
};

function publishedPlaces(list: KzPlace[]): KzPlace[] {
  return list.filter((p) => p.published);
}

export function getKzPlacesIndex(): KzPlacesIndex {
  return indexJson as KzPlacesIndex;
}

export function getAllKzPlaces(): KzPlace[] {
  const all = Object.values(REGION_FILES).flatMap(publishedPlaces);
  return all.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function getKzPlacesByRegion(region: string): KzPlace[] {
  const list = REGION_FILES[region];
  if (!list) return [];
  return publishedPlaces(list).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function getKzPlaceById(id: string): KzPlace | null {
  for (const list of Object.values(REGION_FILES)) {
    const hit = list.find((p) => p.id === id && p.published);
    if (hit) return hit;
  }
  return null;
}

export function searchKzPlaces(query: {
  region?: string | null;
  category?: string | null;
  q?: string | null;
}): KzPlace[] {
  let list = query.region ? getKzPlacesByRegion(query.region) : getAllKzPlaces();

  if (query.category) {
    list = list.filter((p) => p.category === query.category);
  }

  const q = query.q?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return list;
}

/** Haversine distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getKzPlacesNearby(
  lat: number,
  lng: number,
  radiusKm: number,
): Array<KzPlace & { distanceKm: number }> {
  return getAllKzPlaces()
    .map((p) => ({ ...p, distanceKm: distanceKm({ lat, lng }, p) }))
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
