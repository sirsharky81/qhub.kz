import type { KzMapRegionBundle } from "./types";

/** Protomaps basemap v4 — Produced Work of OpenStreetMap (ODbL). */
export const PROTOMAPS_PLANET_URL =
  process.env.KZ_MAPS_PROTOMAPS_SOURCE_URL?.trim() ||
  process.env.NEXT_PUBLIC_KZ_MAPS_PROTOMAPS_SOURCE_URL?.trim() ||
  "https://data.source.coop/protomaps/openstreetmap/v4.pmtiles";

export const PROTOMAPS_ATTRIBUTION_HTML =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const PROTOMAPS_LICENSE_NOTE =
  "Картографические данные — Produced Work OpenStreetMap (ODbL). Необходима видимая attribution © OpenStreetMap на карте.";

/** Max zoom for regional extract (14 ≈ хороший баланс размер/детализация для походов). */
export const PROTOMAPS_REGION_MAX_ZOOM = 14;

export function regionBboxToProtomapsArg(
  bbox: KzMapRegionBundle["bbox"],
): string {
  const [[south, west], [north, east]] = bbox;
  return `${west},${south},${east},${north}`;
}

/** Client/server download: extract region from Protomaps planet (not qhub VPS bundles). */
export function getRegionPmtilesDownloadUrl(regionId: string): string {
  return `/api/kz-maps/bundles/${encodeURIComponent(regionId)}/pmtiles`;
}

export function getOfflineMapAttributionHtml(): string {
  return PROTOMAPS_ATTRIBUTION_HTML;
}
