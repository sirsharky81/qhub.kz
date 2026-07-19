"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  KZ_MAP_ATTRIBUTION,
  KZ_MAP_DEFAULT_CENTER,
  KZ_MAP_DEFAULT_ZOOM,
  KZ_MAP_KZ_RASTER_ENABLED,
  KZ_MAP_KZ_RASTER_URL,
  KZ_MAP_PLACE_ZOOM,
  KZ_MAP_STYLE_URL,
  kzBoundsLngLat,
} from "@/lib/kz-maps/map-config";
import { lineFeatureCollection, pointsToLineGeoJson, type TrackPoint } from "@/lib/kz-maps/gpx";
import { placesToGeoJson } from "@/lib/kz-maps/places-geojson";
import { ensurePmtilesProtocol, offlinePmtilesStyle } from "@/lib/kz-maps/pmtiles-protocol";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import type { KzPlace } from "@/lib/kz-maps/types";

const PLACES_SOURCE = "kz-places";
const PLACES_LAYER = "kz-places-circles";
const PLACES_LABELS = "kz-places-labels";
const TRACKS_SOURCE = "kz-tracks";
const TRACKS_LAYER = "kz-tracks-line";
const LIVE_TRACK_SOURCE = "kz-live-track";
const LIVE_TRACK_LAYER = "kz-live-track-line";
const ROUTE_SOURCE = "kz-route";
const ROUTE_LAYER = "kz-route-vehicle";
const ROUTE_FOOT_LAYER = "kz-route-foot";
const DEST_SOURCE = "kz-route-dest";
const DEST_LAYER = "kz-route-dest-pin";

const EMPTY_POINTS: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_LINES: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [],
};

const CATEGORY_COLORS: Record<string, string> = {
  nature: "#059669",
  viewpoint: "#0ea5e9",
  waterfall: "#06b6d4",
  lake: "#2563eb",
  petroglyphs: "#b45309",
  historic: "#7c3aed",
  trail: "#65a30d",
  urban: "#64748b",
};

const MATCH_COLORS: (string | maplibregl.ExpressionSpecification)[] = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flat(),
  "#059669",
];

export interface PlacePin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  summary: string;
}

interface Props {
  places: KzPlace[];
  focusPlaceId?: string;
  className?: string;
  trackLines?: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  routeLines?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  liveTrackPoints?: TrackPoint[];
  onRouteToPlace?: (place: PlacePin) => void;
  offlinePmtilesUrl?: string | null;
  pickDestMode?: boolean;
  destMarker?: { lat: number; lng: number } | null;
  onMapPick?: (coords: { lat: number; lng: number }) => void;
}

export function KzMapView({
  places,
  focusPlaceId,
  className = "",
  trackLines,
  routeLines,
  liveTrackPoints = [],
  onRouteToPlace,
  offlinePmtilesUrl = null,
  pickDestMode = false,
  destMarker = null,
  onMapPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const placesRef = useRef(places);
  const onRouteRef = useRef(onRouteToPlace);
  const onMapPickRef = useRef(onMapPick);
  const pickModeRef = useRef(pickDestMode);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  placesRef.current = places;
  onRouteRef.current = onRouteToPlace;
  onMapPickRef.current = onMapPick;
  pickModeRef.current = pickDestMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    ensurePmtilesProtocol();

    const useOffline =
      offlinePmtilesUrl &&
      typeof navigator !== "undefined" &&
      !navigator.onLine;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: useOffline ? offlinePmtilesStyle(offlinePmtilesUrl) : KZ_MAP_STYLE_URL,
      center: KZ_MAP_DEFAULT_CENTER,
      zoom: KZ_MAP_DEFAULT_ZOOM,
      attributionControl: false,
      maxZoom: 18,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "top-right",
    );

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "300px",
    });
    popupRef.current = popup;

    map.on("load", () => {
      if (cancelled) return;

      if (KZ_MAP_KZ_RASTER_ENABLED) {
        map.addSource("kz-raster", {
          type: "raster",
          tiles: [KZ_MAP_KZ_RASTER_URL],
          tileSize: 256,
          bounds: kzBoundsLngLat(),
          minzoom: 0,
          maxzoom: 18,
        });
        map.addLayer({
          id: "kz-raster-layer",
          type: "raster",
          source: "kz-raster",
          paint: { "raster-opacity": 1 },
        });
      }

      map.addSource(TRACKS_SOURCE, { type: "geojson", data: EMPTY_LINES });
      map.addLayer({
        id: TRACKS_LAYER,
        type: "line",
        source: TRACKS_SOURCE,
        paint: {
          "line-color": "#ea580c",
          "line-width": 4,
          "line-opacity": 0.85,
        },
      });

      map.addSource(LIVE_TRACK_SOURCE, { type: "geojson", data: EMPTY_LINES });
      map.addLayer({
        id: LIVE_TRACK_LAYER,
        type: "line",
        source: LIVE_TRACK_SOURCE,
        paint: {
          "line-color": "#dc2626",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_LINES });

      map.addSource(PLACES_SOURCE, {
        type: "geojson",
        data: placesToGeoJson(placesRef.current),
      });

      map.addLayer({
        id: PLACES_LAYER,
        type: "circle",
        source: PLACES_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7, 14, 10],
          "circle-color": MATCH_COLORS as maplibregl.ExpressionSpecification,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: PLACES_LABELS,
        type: "symbol",
        source: PLACES_SOURCE,
        minzoom: 9,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-max-width": 12,
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["!=", ["get", "profile"], "foot"],
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "profile"],
            "car",
            "#2563eb",
            "bike",
            "#7c3aed",
            "#2563eb",
          ],
          "line-width": 6,
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: ROUTE_FOOT_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["==", ["get", "profile"], "foot"],
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#059669",
          "line-width": 5,
          "line-opacity": 0.95,
          "line-dasharray": [2, 1.5],
        },
      });

      map.addSource(DEST_SOURCE, { type: "geojson", data: EMPTY_POINTS });
      map.addLayer({
        id: DEST_LAYER,
        type: "circle",
        source: DEST_SOURCE,
        paint: {
          "circle-radius": 9,
          "circle-color": "#2563eb",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", (e) => {
        if (!pickModeRef.current) return;
        onMapPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      map.on("click", PLACES_LAYER, (e) => {
        if (pickModeRef.current) return;
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const props = feature.properties;
        if (!props) return;
        const category =
          KZ_PLACE_CATEGORY_LABELS[props.category as keyof typeof KZ_PLACE_CATEGORY_LABELS] ??
          props.category;
        const [lng, lat] = feature.geometry.coordinates as [number, number];

        const root = document.createElement("div");
        root.style.fontFamily = "system-ui, sans-serif";
        root.innerHTML = `
          <p style="margin:0;font-weight:600;font-size:14px;">${props.name}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#059669;">${category}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#4b5563;line-height:1.4;">${props.summary}</p>
        `;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Построить маршрут";
        btn.style.cssText =
          "margin-top:10px;width:100%;border-radius:10px;background:#2563eb;color:#fff;border:none;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;";
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onRouteRef.current?.({
            id: String(props.id),
            name: String(props.name),
            lat,
            lng,
            category: String(props.category),
            summary: String(props.summary),
          });
          popup.remove();
        });
        root.appendChild(btn);

        popup.setLngLat([lng, lat]).setDOMContent(root).addTo(map);
      });

      map.on("mouseenter", PLACES_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", PLACES_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      if (placesRef.current.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of placesRef.current) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 8, duration: 0 });
      }

      setReady(true);
    });

    map.on("error", (e) => {
      if (cancelled) return;
      const msg = e.error?.message || "Ошибка загрузки карты";
      setError(msg);
    });

    mapRef.current = map;

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
    source?.setData(placesToGeoJson(places));
  }, [places, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(TRACKS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(trackLines ?? EMPTY_LINES);
  }, [trackLines, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(routeLines ?? EMPTY_LINES);

    const features = routeLines?.features ?? [];
    if (features.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const feature of features) {
      for (const coord of feature.geometry.coordinates) {
        bounds.extend(coord as [number, number]);
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 800 });
    }
  }, [routeLines, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(LIVE_TRACK_SOURCE) as GeoJSONSource | undefined;
    if (liveTrackPoints.length < 2) {
      source?.setData(EMPTY_LINES);
      return;
    }
    source?.setData(lineFeatureCollection([pointsToLineGeoJson(liveTrackPoints, { live: 1 })]));
  }, [liveTrackPoints, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(DEST_SOURCE) as GeoJSONSource | undefined;
    if (!destMarker) {
      source?.setData(EMPTY_POINTS);
      return;
    }
    source?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [destMarker.lng, destMarker.lat],
          },
        },
      ],
    });
  }, [destMarker, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = pickDestMode ? "crosshair" : "";
  }, [pickDestMode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusPlaceId) return;
    const focus = places.find((p) => p.id === focusPlaceId);
    if (!focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: KZ_MAP_PLACE_ZOOM, duration: 800 });
  }, [focusPlaceId, places, ready]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {pickDestMode && (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-sky-600 text-white px-4 py-2 text-xs font-medium shadow-lg pointer-events-none">
          Нажмите на карту — куда строить маршрут
        </div>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-gray-500">
          Загрузка карты…
        </div>
      )}
      {error && (
        <div className="absolute inset-x-4 top-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div
        className="absolute bottom-1 left-1 right-12 text-[9px] text-gray-500/90 pointer-events-none leading-tight"
        dangerouslySetInnerHTML={{ __html: KZ_MAP_ATTRIBUTION }}
      />
    </div>
  );
}
