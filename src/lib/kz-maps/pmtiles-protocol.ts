import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { getOfflineMapAttributionHtml } from "./offline-map-source";

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

/** Minimal vector style for offline Protomaps v4 PMTiles (earth / water / roads). */
export function offlinePmtilesStyle(pmtilesUrl: string): maplibregl.StyleSpecification {
  const src = toPmtilesUrl(pmtilesUrl);
  return {
    version: 8,
    sources: {
      offline: { type: "vector", url: src, attribution: getOfflineMapAttributionHtml() },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#eef2f6" },
      },
      {
        id: "earth",
        type: "fill",
        source: "offline",
        "source-layer": "earth",
        paint: { "fill-color": "#e8ecef" },
      },
      {
        id: "landuse",
        type: "fill",
        source: "offline",
        "source-layer": "landuse",
        paint: { "fill-color": "#e2e8e4", "fill-opacity": 0.6 },
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
        "source-layer": "roads",
        paint: { "line-color": "#ffffff", "line-width": 1.5 },
      },
    ],
  };
}
