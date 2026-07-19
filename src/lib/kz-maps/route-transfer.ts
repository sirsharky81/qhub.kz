import type { RouteProfile, RouteSegment } from "./gpx";

const EARTH_R = 6371000;

/** Min gap between road end and destination before adding a foot segment. */
export const OFFROAD_THRESHOLD_M = 250;

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
};

export function coordDistanceM(
  a: [number, number],
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a[1]) * Math.PI) / 180;
  const dLng = ((b.lng - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function mergeRouteCoordinates(
  vehicleCoords: [number, number][],
  footCoords: [number, number][],
): [number, number][] {
  if (footCoords.length === 0) return vehicleCoords;
  const merged = [...vehicleCoords];
  const last = vehicleCoords[vehicleCoords.length - 1];
  const footStart = footCoords[0];
  if (last && footStart && coordDistanceM(last, { lat: footStart[1], lng: footStart[0] }) < 5) {
    merged.push(...footCoords.slice(1));
  } else {
    merged.push(...footCoords);
  }
  return merged;
}

function formatGap(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace(/\.0$/, "")} км`;
  return `${Math.round(m)} м`;
}

export async function appendFootTransferIfNeeded(
  vehicleRoute: OsrmRoute,
  to: { lat: number; lng: number },
  vehicleProfile: RouteProfile,
  fetchFootRoute: (from: [number, number], to: { lat: number; lng: number }) => Promise<OsrmRoute | null>,
): Promise<{
  coordinates: [number, number][];
  distanceM: number;
  durationSec: number;
  segments?: RouteSegment[];
  footTransferNote?: string;
}> {
  const vehicleCoords = vehicleRoute.geometry.coordinates;
  const roadEnd = vehicleCoords[vehicleCoords.length - 1];
  if (!roadEnd) {
    return {
      coordinates: vehicleCoords,
      distanceM: Math.round(vehicleRoute.distance),
      durationSec: Math.round(vehicleRoute.duration),
    };
  }

  const gapM = coordDistanceM(roadEnd, to);
  if (gapM < OFFROAD_THRESHOLD_M) {
    return {
      coordinates: vehicleCoords,
      distanceM: Math.round(vehicleRoute.distance),
      durationSec: Math.round(vehicleRoute.duration),
    };
  }

  const footRoute = await fetchFootRoute(roadEnd, to);
  const footDist = footRoute?.distance ?? 0;

  if (footRoute && footDist >= 50) {
    const footCoords = footRoute.geometry.coordinates;
    const merged = mergeRouteCoordinates(vehicleCoords, footCoords);

    return {
      coordinates: merged,
      distanceM: Math.round(vehicleRoute.distance + footRoute.distance),
      durationSec: Math.round(vehicleRoute.duration + footRoute.duration),
      segments: [
        {
          profile: vehicleProfile,
          distanceM: Math.round(vehicleRoute.distance),
          durationSec: Math.round(vehicleRoute.duration),
          coordinates: vehicleCoords,
        },
        {
          profile: "foot",
          distanceM: Math.round(footRoute.distance),
          durationSec: Math.round(footRoute.duration),
          coordinates: footCoords,
        },
      ],
      footTransferNote: `Последние ${formatGap(footRoute.distance)} — пешком до точки назначения (авто/вело до парковки).`,
    };
  }

  // OSM has no trail — show direct walk from road end to the requested point.
  const directFootCoords: [number, number][] = [roadEnd, [to.lng, to.lat]];
  const walkDurationSec = Math.round(gapM / (5000 / 3600));
  const merged = mergeRouteCoordinates(vehicleCoords, directFootCoords.slice(1));

  return {
    coordinates: merged,
    distanceM: Math.round(vehicleRoute.distance + gapM),
    durationSec: Math.round(vehicleRoute.duration + walkDurationSec),
    segments: [
      {
        profile: vehicleProfile,
        distanceM: Math.round(vehicleRoute.distance),
        durationSec: Math.round(vehicleRoute.duration),
        coordinates: vehicleCoords,
      },
      {
        profile: "foot",
        distanceM: Math.round(gapM),
        durationSec: walkDurationSec,
        coordinates: directFootCoords,
      },
    ],
    footTransferNote: `Последние ${formatGap(gapM)} — пешком до точки (дорога заканчивается раньше, тропа может отсутствовать в OSM).`,
  };
}
