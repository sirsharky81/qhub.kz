import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let protocolReady = false;

export function ensurePmtilesProtocol(): void {
  if (protocolReady || typeof window === "undefined") return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolReady = true;
}

export function toPmtilesUrl(localOrRemote: string): string {
  if (localOrRemote.startsWith("pmtiles://")) return localOrRemote;
  return `pmtiles://${localOrRemote}`;
}

/** Minimal vector style for offline PMTiles (OpenMapTiles-like layer names). */
export function offlinePmtilesStyle(pmtilesUrl: string): maplibregl.StyleSpecification {
  const src = toPmtilesUrl(pmtilesUrl);
  return {
    version: 8,
    sources: {
      offline: { type: "vector", url: src },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#eef2f6" },
      },
      {
        id: "water",
        type: "fill",
        source: "offline",
        "source-layer": "water",
        paint: { "fill-color": "#aad3df" },
      },
      {
        id: "roads",
        type: "line",
        source: "offline",
        "source-layer": "transportation",
        paint: { "line-color": "#ffffff", "line-width": 1.5 },
      },
    ],
  };
}
