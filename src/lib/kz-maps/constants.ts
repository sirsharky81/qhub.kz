import type { KzPlaceCategory } from "./types";

/** Approximate bounding box for Kazakhstan tile overlay. */
export const KZ_BOUNDS: [[number, number], [number, number]] = [
  [40.56, 46.47],
  [55.45, 87.36],
];

export const KZ_PLACE_CATEGORY_LABELS: Record<KzPlaceCategory, string> = {
  nature: "Природа",
  viewpoint: "Смотровая",
  waterfall: "Водопад",
  lake: "Озеро",
  petroglyphs: "Петроглифы",
  historic: "История",
  trail: "Тропа / поход",
  urban: "Город",
};

export const REDIS_KZ_MAPS_PLACE_PREFIX = "qhub:kz-maps:place:";
export const REDIS_KZ_MAPS_REGION_PLACES_PREFIX = "qhub:kz-maps:region:";
export const REDIS_KZ_MAPS_PENDING_PREFIX = "qhub:kz-maps:pending:";
