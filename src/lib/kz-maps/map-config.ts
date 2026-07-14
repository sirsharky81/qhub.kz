import { KZ_BOUNDS } from "./constants";

/** Default map center: Almaty. */
export const KZ_MAP_DEFAULT_CENTER: [number, number] = [43.238949, 76.889709];
export const KZ_MAP_DEFAULT_ZOOM = 5;
export const KZ_MAP_PLACE_ZOOM = 11;

/** MapLibre style (vector, free, OSM-based). */
export const KZ_MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_KZ_MAPS_STYLE_URL?.trim() ||
  "https://tiles.openfreemap.org/styles/liberty";

/**
 * Self-hosted KZ raster overlay (optional). Enable with NEXT_PUBLIC_KZ_MAPS_KZ_RASTER_ENABLED=1
 * after KZ_MAPS_TILES_DIR is populated on the server.
 */
export const KZ_MAP_KZ_RASTER_ENABLED =
  process.env.NEXT_PUBLIC_KZ_MAPS_KZ_RASTER_ENABLED === "1";

export const KZ_MAP_KZ_RASTER_URL =
  process.env.NEXT_PUBLIC_KZ_MAPS_KZ_TILES_URL?.trim() ||
  "/api/kz-maps/tiles/{z}/{x}/{y}.png";

export const KZ_MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>';

/** MapLibre bounds: [west, south, east, north] */
export function kzBoundsLngLat(): [number, number, number, number] {
  const [[south, west], [north, east]] = KZ_BOUNDS;
  return [west, south, east, north];
}
