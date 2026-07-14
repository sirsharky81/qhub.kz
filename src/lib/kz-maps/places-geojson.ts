import type { KzPlace } from "./types";

export interface PlacesGeoJson {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: string;
      name: string;
      category: string;
      summary: string;
      region: string;
    };
  }>;
}

export function placesToGeoJson(places: KzPlace[]): PlacesGeoJson {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [p.lng, p.lat],
      },
      properties: {
        id: p.id,
        name: p.name,
        category: p.category,
        summary: p.summary,
        region: p.region,
      },
    })),
  };
}
