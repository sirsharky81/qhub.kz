"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlacePin } from "../components/KzMapView";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import { getCurrentPosition, startGeoWatch } from "@/lib/family/geo";
import {
  buildGpx,
  downloadGpx,
  formatDistance,
  formatDuration,
  lineFeatureCollection,
  parseGpx,
  pointsToLineGeoJson,
  trackDistanceM,
  type RouteProfile,
  type TrackPoint,
} from "@/lib/kz-maps/gpx";
import { getAllKzPlaces, getKzPlaceById, getKzPlacesIndex } from "@/lib/kz-maps/places";
import { fetchRoute } from "@/lib/kz-maps/route-client";
import {
  deleteStoredTrack,
  listStoredTracks,
  newTrackId,
  saveStoredTrack,
} from "@/lib/kz-maps/tracks-storage";
import type { StoredTrack } from "@/lib/kz-maps/gpx";
import type { KzPlaceCategory } from "@/lib/kz-maps/types";

const KzMapView = dynamic(() => import("../components/KzMapView").then((m) => m.KzMapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-gray-500">
      Загрузка карты…
    </div>
  ),
});

const MIN_STEP_M = 8;
type PanelTab = "places" | "tracks" | "route";

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

function KzMapsMapInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusPlaceId = searchParams.get("place") ?? undefined;
  const routeToId = searchParams.get("routeTo") ?? undefined;

  const index = getKzPlacesIndex();
  const allPlaces = getAllKzPlaces();

  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>(routeToId ? "route" : "places");

  const [storedTracks, setStoredTracks] = useState<StoredTrack[]>([]);
  const [visibleTrackIds, setVisibleTrackIds] = useState<Set<string>>(new Set());

  const [recording, setRecording] = useState(false);
  const [livePoints, setLivePoints] = useState<TrackPoint[]>([]);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [routeProfile, setRouteProfile] = useState<RouteProfile>("foot");
  const [routeDestId, setRouteDestId] = useState(routeToId ?? focusPlaceId ?? "");
  const [routeLine, setRouteLine] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceM: number; durationSec: number } | null>(
    null,
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    setStoredTracks(listStoredTracks());
    setVisibleTrackIds(new Set(listStoredTracks().map((t) => t.id)));
  }, []);

  useEffect(() => {
    if (routeToId) {
      setRouteDestId(routeToId);
      setPanelTab("route");
      setPanelOpen(true);
    }
  }, [routeToId]);

  const filteredPlaces = useMemo(() => {
    let list = allPlaces;
    if (region) list = list.filter((p) => p.region === region);
    if (category) list = list.filter((p) => p.category === category);
    return list;
  }, [allPlaces, region, category]);

  const trackLines = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const t of storedTracks) {
      if (!visibleTrackIds.has(t.id)) continue;
      try {
        const parsed = parseGpx(t.gpx);
        features.push(pointsToLineGeoJson(parsed.points, { id: t.id, name: t.name }));
      } catch {
        // skip broken
      }
    }
    return lineFeatureCollection(features);
  }, [storedTracks, visibleTrackIds]);

  function focusPlace(id: string) {
    router.replace(`/tools/kz-maps/map?place=${encodeURIComponent(id)}`);
  }

  const appendLivePoint = useCallback((pos: { lat: number; lng: number }) => {
    setLivePoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && haversineM(last, pos) < MIN_STEP_M) return prev;
      return [...prev, { lat: pos.lat, lng: pos.lng, ts: Date.now() }];
    });
  }, []);

  const startRecording = useCallback(() => {
    setLivePoints([]);
    setRecording(true);
    setPanelTab("tracks");
    setPanelOpen(true);
    stopWatchRef.current = startGeoWatch(appendLivePoint);
  }, [appendLivePoint]);

  const stopRecording = useCallback(() => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    setRecording(false);

    setLivePoints((pts) => {
      if (pts.length >= 2) {
        const name = `Трек ${new Date().toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
        const gpx = buildGpx(name, pts);
        const parsed = parseGpx(gpx);
        const stored: StoredTrack = {
          id: newTrackId(),
          name,
          createdAt: Date.now(),
          distanceM: parsed.distanceM,
          durationSec: parsed.durationSec,
          gpx,
        };
        saveStoredTrack(stored);
        setStoredTracks(listStoredTracks());
        setVisibleTrackIds((s) => new Set(s).add(stored.id));
      }
      return [];
    });
  }, []);

  useEffect(() => {
    return () => {
      stopWatchRef.current?.();
    };
  }, []);

  async function handleGpxFile(file: File) {
    const text = await file.text();
    const parsed = parseGpx(text);
    const name = parsed.name || file.name.replace(/\.gpx$/i, "");
    const stored: StoredTrack = {
      id: newTrackId(),
      name,
      createdAt: Date.now(),
      distanceM: parsed.distanceM,
      durationSec: parsed.durationSec,
      gpx: text,
    };
    saveStoredTrack(stored);
    setStoredTracks(listStoredTracks());
    setVisibleTrackIds((s) => new Set(s).add(stored.id));
    setPanelTab("tracks");
    setPanelOpen(true);
  }

  async function buildRoute(dest?: { lat: number; lng: number }) {
    setRouteError(null);
    setRouteLoading(true);
    try {
      const place = getKzPlaceById(routeDestId);
      const to = dest ?? (place ? { lat: place.lat, lng: place.lng } : null);
      if (!to) throw new Error("Выберите пункт назначения");

      const from = await getCurrentPosition();
      const result = await fetchRoute(from, to, routeProfile);
      setRouteLine({
        type: "Feature",
        properties: { profile: routeProfile },
        geometry: { type: "LineString", coordinates: result.coordinates },
      });
      setRouteInfo({ distanceM: result.distanceM, durationSec: result.durationSec });
      setPanelTab("route");
      setPanelOpen(true);
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "Ошибка маршрута");
      setRouteLine(null);
      setRouteInfo(null);
    } finally {
      setRouteLoading(false);
    }
  }

  function handleRouteToPlace(place: PlacePin) {
    setRouteDestId(place.id);
    setPanelTab("route");
    setPanelOpen(true);
    void buildRoute({ lat: place.lat, lng: place.lng });
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="shrink-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur px-3 py-2.5 flex items-center gap-2">
        <Link
          href="/tools/kz-maps"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 shrink-0"
          aria-label="Назад"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-gray-900 truncate">Карта KZ</h1>
          <p className="text-[11px] text-gray-500">
            {recording ? "Запись трека…" : `${filteredPlaces.length} мест`}
          </p>
        </div>
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-full bg-red-600 text-white px-3 py-1.5 text-xs font-semibold shrink-0"
          >
            Запись
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-full bg-gray-900 text-white px-3 py-1.5 text-xs font-semibold shrink-0"
          >
            Стоп
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 shrink-0"
        >
          {panelOpen ? "Скрыть" : "Панель"}
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        <KzMapView
          places={filteredPlaces}
          focusPlaceId={focusPlaceId}
          trackLines={trackLines}
          routeLine={routeLine}
          liveTrackPoints={livePoints}
          onRouteToPlace={handleRouteToPlace}
          className="absolute inset-0"
        />

        {recording && livePoints.length > 0 && (
          <div className="absolute top-3 left-3 z-10 rounded-xl bg-red-600 text-white px-3 py-2 text-xs font-medium shadow">
            {formatDistance(trackDistanceM(livePoints))} · {livePoints.length} точек
          </div>
        )}

        {panelOpen && (
          <div
            className="absolute z-10 bottom-0 inset-x-0 max-h-[48%] overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl flex flex-col"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="shrink-0 flex border-b border-gray-100">
              {(
                [
                  ["places", "Места"],
                  ["tracks", "Треки"],
                  ["route", "Маршрут"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPanelTab(id)}
                  className={`flex-1 py-2.5 text-xs font-semibold ${
                    panelTab === id
                      ? "text-emerald-800 border-b-2 border-emerald-600"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {panelTab === "places" && (
              <>
                <div className="shrink-0 px-3 pt-2 pb-2 flex gap-2">
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <option value="">Все регионы</option>
                    {index.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <option value="">Все категории</option>
                    {(Object.keys(KZ_PLACE_CATEGORY_LABELS) as KzPlaceCategory[]).map((id) => (
                      <option key={id} value={id}>
                        {KZ_PLACE_CATEGORY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </div>
                <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
                  {filteredPlaces.map((place) => (
                    <li key={place.id} className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => focusPlace(place.id)}
                        className={`flex-1 text-left min-w-0 ${
                          focusPlaceId === place.id ? "text-emerald-800" : ""
                        }`}
                      >
                        <p className="text-sm font-medium truncate">{place.name}</p>
                        <p className="text-[11px] text-emerald-700">
                          {KZ_PLACE_CATEGORY_LABELS[place.category]}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRouteToPlace(place)}
                        className="shrink-0 rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700"
                      >
                        Маршрут
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {panelTab === "tracks" && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={recording}
                    onClick={startRecording}
                    className="flex-1 rounded-xl bg-red-600 text-white py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {recording ? "Идёт запись…" : "Записать трек"}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-800"
                  >
                    Импорт GPX
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gpx,application/gpx+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleGpxFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>

                {storedTracks.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">
                    Нет сохранённых треков. Запишите поход или загрузите GPX.
                  </p>
                )}

                <ul className="space-y-2">
                  {storedTracks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2"
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleTrackIds.has(t.id)}
                          onChange={(e) => {
                            setVisibleTrackIds((s) => {
                              const next = new Set(s);
                              if (e.target.checked) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            });
                          }}
                          className="shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {formatDistance(t.distanceM)} · {formatDuration(t.durationSec)}
                          </p>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => downloadGpx(t.name, t.gpx)}
                        className="shrink-0 text-[11px] text-sky-700 font-medium"
                      >
                        GPX
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteStoredTrack(t.id);
                          setStoredTracks(listStoredTracks());
                          setVisibleTrackIds((s) => {
                            const next = new Set(s);
                            next.delete(t.id);
                            return next;
                          });
                        }}
                        className="shrink-0 text-[11px] text-red-600"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {panelTab === "route" && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <p className="text-xs text-gray-600">
                  Маршрут от вашей геолокации до выбранного места (OSM / OSRM).
                </p>
                <select
                  value={routeDestId}
                  onChange={(e) => setRouteDestId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <option value="">Куда едем?</option>
                  {allPlaces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  {(
                    [
                      ["foot", "Пешком"],
                      ["car", "Авто"],
                      ["bike", "Вело"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRouteProfile(id)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold ${
                        routeProfile === id
                          ? "bg-sky-600 text-white"
                          : "border border-gray-200 text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!routeDestId || routeLoading}
                  onClick={() => void buildRoute()}
                  className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {routeLoading ? "Построение…" : "Построить маршрут"}
                </button>
                {routeError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{routeError}</p>
                )}
                {routeInfo && (
                  <p className="text-sm text-gray-800 bg-sky-50 rounded-xl px-3 py-2">
                    {formatDistance(routeInfo.distanceM)} · ~{formatDuration(routeInfo.durationSec)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function KzMapsMapClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <KzMapsMapInner />
    </Suspense>
  );
}
