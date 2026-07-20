export type KzPlaceCategory =
  | "nature"
  | "viewpoint"
  | "waterfall"
  | "lake"
  | "petroglyphs"
  | "historic"
  | "trail"
  | "urban";

export type KzPlaceSeason = "spring" | "summer" | "autumn" | "winter";

export type KzPlaceDifficulty = "easy" | "medium" | "hard";

export type KzPlaceSource = "qhub" | "osm" | "community";

export interface KzPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  category: KzPlaceCategory;
  summary: string;
  description?: string;
  tags: string[];
  photos?: string[];
  difficulty?: KzPlaceDifficulty;
  season?: KzPlaceSeason[];
  linkedTrackIds?: string[];
  source: KzPlaceSource;
  osmId?: number;
  published: boolean;
  updatedAt: number;
}

export interface KzMapRegionMeta {
  id: string;
  name: string;
  placeCount: number;
}

export interface KzPlacesIndex {
  regions: KzMapRegionMeta[];
  updatedAt: number;
}

export interface UserWaypoint {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserTrackMeta {
  id: string;
  userId: string;
  name: string;
  region?: string;
  distanceM: number;
  durationSec: number;
  pointCount: number;
  gpxUrl?: string;
  createdAt: number;
  isPublic: boolean;
}

export interface KzMapRegionBundle {
  id: string;
  name: string;
  bbox: [[number, number], [number, number]];
  pmtilesUrl?: string;
  pmtilesBytes?: number;
  placesBundleUrl?: string;
  placesCount: number;
  updatedAt: string;
  /** Human-readable data source for offline map tiles. */
  mapDataSource?: string;
}
