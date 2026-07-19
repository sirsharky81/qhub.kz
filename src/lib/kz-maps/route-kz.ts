import { KZ_BOUNDS } from "./constants";

/** [lng, lat] — major road hubs for long routes inside Kazakhstan. */
const KZ_HUBS = {
  astana: [71.4704, 51.1282] as const,
  kyzylorda: [65.482, 44.848] as const,
  aktau: [51.168, 43.653] as const,
  shymkent: [69.597, 42.315] as const,
} satisfies Record<string, readonly [number, number]>;

const [[KZ_SOUTH, KZ_WEST], [KZ_NORTH, KZ_EAST]] = KZ_BOUNDS;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isInKzBounds(lat: number, lng: number, marginDeg = 0.08): boolean {
  return (
    lat >= KZ_SOUTH - marginDeg &&
    lat <= KZ_NORTH + marginDeg &&
    lng >= KZ_WEST - marginDeg &&
    lng <= KZ_EAST + marginDeg
  );
}

export function bothPointsInKz(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): boolean {
  return isInKzBounds(from.lat, from.lng) && isInKzBounds(to.lat, to.lng);
}

/** True when OSRM geometry leaves Kazakhstan (common with global OSM graph). */
export function routeExitsKz(coordinates: [number, number][]): boolean {
  for (const [lng, lat] of coordinates) {
    if (!isInKzBounds(lat, lng)) return true;
  }
  return false;
}

/**
 * Pick via-points so long routes stay on the Kazakh road network in OSRM.
 * Direct Almaty → Mangystau often detours through UZ/TM because OSM gaps in central KZ.
 */
export function getKzViaWaypoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): [number, number][] {
  const distM = haversineM(from, to);
  if (distM < 250_000) return [];

  const vias: [number, number][] = [];
  const goingWest = to.lng < from.lng - 2;
  const farWest = to.lng < 55;
  const toSouthwest = to.lat < 44.5 && to.lng < 60;

  if (goingWest && (farWest || toSouthwest)) {
    // Northern backbone: Almaty → Astana → Aktau → Mangystau/Atyrau
    vias.push([...KZ_HUBS.astana]);
    if (to.lng < 53 || distM > 1_200_000) {
      vias.push([...KZ_HUBS.aktau]);
    }
    return vias;
  }

  if (goingWest && distM > 600_000) {
    vias.push([...KZ_HUBS.kyzylorda]);
    return vias;
  }

  if (distM > 800_000) {
    vias.push([...KZ_HUBS.astana]);
  }

  return vias;
}

export function buildOsrmCoordString(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  vias: [number, number][] = [],
): string {
  const parts = [`${from.lng},${from.lat}`];
  for (const [lng, lat] of vias) parts.push(`${lng},${lat}`);
  parts.push(`${to.lng},${to.lat}`);
  return parts.join(";");
}
