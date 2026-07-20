"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PlacePin } from "../components/KzMapView";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import { getCurrentPosition } from "@/lib/family/geo";
import { PlatformLocation } from "@/lib/platform/location";
import {
  buildGpx,
  downloadGpx,
  formatDistance,
  formatDuration,
  lineFeatureCollection,
  parseGpx,
  pointsToLineGeoJson,
  shareGpx,
  trackDistanceM,
  trackEndpoints,
  trackBoundsLngLat,
  type RouteProfile,
  type RouteResult,
  type RouteSegment,
  type TrackPoint,
} from "@/lib/kz-maps/gpx";
import { getAllKzPlaces, getKzPlaceById, getKzPlacesIndex } from "@/lib/kz-maps/places";
import { getAllCachedPlaces, getOfflinePmtilesUrl, listOfflineRegions } from "@/lib/kz-maps/offline-storage";
import { fetchRoute } from "@/lib/kz-maps/route-client";
import { snapTrackToRoads } from "@/lib/kz-maps/route-snap";
import { isTrackSynced, syncTrackToServer } from "@/lib/kz-maps/tracks-sync";
import {
  deleteStoredTrack,
  listStoredTracks,
  newTrackId,
  saveStoredTrack,
} from "@/lib/kz-maps/tracks-storage";
import {
  getTrackRecordingCapabilities,
  startTrackRecording,
  type TrackRecordingCapabilities,
} from "@/lib/kz-maps/track-recording";
import { readRecordingBuffer } from "@/lib/kz-maps/track-recording-buffer";
import type { StoredTrack } from "@/lib/kz-maps/gpx";
import type { KzPlace, KzPlaceCategory } from "@/lib/kz-maps/types";

const KzMapView = dynamic(() => import("../components/KzMapView").then((m) => m.KzMapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-gray-500">
      Загрузка карты…
    </div>
  ),
});

const SEED_PLACES = getAllKzPlaces();
const SEED_PLACE_IDS = new Set(SEED_PLACES.map((p) => p.id));
const PLACES_INDEX = getKzPlacesIndex();

type PanelTab = "places" | "tracks" | "route";

const ROUTE_PROFILE_LABELS: Record<RouteProfile, string> = {
  foot: "пешком",
  car: "авто",
  bike: "вело",
};

function routeResultToLines(result: RouteResult): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const segments = result.segments ?? [
    {
      profile: result.profile,
      distanceM: result.distanceM,
      durationSec: result.durationSec,
      coordinates: result.coordinates,
    },
  ];
  return lineFeatureCollection(
    segments.map((seg) => ({
      type: "Feature" as const,
      properties: { profile: seg.profile },
      geometry: { type: "LineString" as const, coordinates: seg.coordinates },
    })),
  );
}

function KzMapsMapInner() {
  const searchParams = useSearchParams();
  const urlPlaceId = searchParams.get("place") ?? undefined;
  const routeToId = searchParams.get("routeTo") ?? undefined;

  const [focusPlaceId, setFocusPlaceId] = useState<string | undefined>(urlPlaceId);
  const [focusTrackId, setFocusTrackId] = useState<string | null>(null);
  const [focusTrackGeneration, setFocusTrackGeneration] = useState(0);
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>(routeToId ? "route" : "places");

  const [storedTracks, setStoredTracks] = useState<StoredTrack[]>([]);
  const [visibleTrackIds, setVisibleTrackIds] = useState<Set<string>>(new Set());

  const [recording, setRecording] = useState(false);
  const [livePoints, setLivePoints] = useState<TrackPoint[]>([]);
  const [recordingCaps, setRecordingCaps] = useState<TrackRecordingCapabilities | null>(
    null,
  );
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const stopTrackRecordingRef = useRef<(() => TrackPoint[]) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [routeProfile, setRouteProfile] = useState<RouteProfile>("foot");
  const [routeDestId, setRouteDestId] = useState(routeToId ?? focusPlaceId ?? "");
  const [routeDestPoint, setRouteDestPoint] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [pickDestMode, setPickDestMode] = useState(false);
  const [routeLines, setRouteLines] = useState<GeoJSON.FeatureCollection<GeoJSON.LineString> | null>(
    null,
  );
  const [routeInfo, setRouteInfo] = useState<{
    distanceM: number;
    durationSec: number;
    segments?: RouteSegment[];
  } | null>(null);
  const [routeFootNote, setRouteFootNote] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeWarning, setRouteWarning] = useState<string | null>(null);
  const [communityPlaces, setCommunityPlaces] = useState<KzPlace[]>([]);
  const [cachedPlaces, setCachedPlaces] = useState<KzPlace[]>([]);
  const [offlinePmtilesUrl, setOfflinePmtilesUrl] = useState<string | null>(null);
  const trackLineCacheRef = useRef(
    new Map<string, GeoJSON.Feature<GeoJSON.LineString>>(),
  );
  const [isOffline, setIsOffline] = useState(false);
  const [snapLoadingId, setSnapLoadingId] = useState<string | null>(null);
  const [trackActionMsg, setTrackActionMsg] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    void fetch("/api/kz-maps/places")
      .then((r) => r.json())
      .then((d: { places?: KzPlace[] }) => {
        setCommunityPlaces((d.places ?? []).filter((p) => !SEED_PLACE_IDS.has(p.id)));
      })
      .catch(() => {});

    setCachedPlaces(getAllCachedPlaces());

    const readyRegion = listOfflineRegions().find((r) => r.pmtilesReady);
    if (readyRegion?.pmtilesLocalUrl) {
      setOfflinePmtilesUrl(readyRegion.pmtilesLocalUrl);
    } else if (readyRegion) {
      void getOfflinePmtilesUrl(readyRegion.id).then((url) => {
        if (url) setOfflinePmtilesUrl(url);
      });
    }
  }, []);

  useEffect(() => {
    if (urlPlaceId) setFocusPlaceId(urlPlaceId);
  }, [urlPlaceId]);

  useEffect(() => {
    if (routeToId) {
      startTransition(() => {
        setRouteDestId(routeToId);
        setPanelTab("route");
        setPanelOpen(true);
      });
    }
  }, [routeToId]);

  useEffect(() => {
    setStoredTracks(listStoredTracks());
    setVisibleTrackIds(new Set(listStoredTracks().map((t) => t.id)));
  }, []);

  const mergedPlaces = useMemo(() => {
    const map = new Map<string, KzPlace>();
    for (const p of [...SEED_PLACES, ...communityPlaces, ...cachedPlaces]) {
      map.set(p.id, p);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [communityPlaces, cachedPlaces]);

  const filteredPlaces = useMemo(() => {
    let list = mergedPlaces;
    if (region) list = list.filter((p) => p.region === region);
    if (category) list = list.filter((p) => p.category === category);
    return list;
  }, [mergedPlaces, region, category]);

  const trackLines = useMemo(() => {
    const cache = trackLineCacheRef.current;
    const activeTrackIds = new Set(storedTracks.map((t) => t.id));
    for (const id of cache.keys()) {
      if (!activeTrackIds.has(id)) cache.delete(id);
    }

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const t of storedTracks) {
      if (!visibleTrackIds.has(t.id)) continue;
      let feature = cache.get(t.id);
      if (!feature) {
        try {
          const parsed = parseGpx(t.gpx);
          feature = pointsToLineGeoJson(parsed.points, { id: t.id, name: t.name });
          cache.set(t.id, feature);
        } catch {
          continue;
        }
      }
      features.push(feature);
    }
    return lineFeatureCollection(features);
  }, [storedTracks, visibleTrackIds]);

  const focusTrackBounds = useMemo(() => {
    if (!focusTrackId) return null;
    const track = storedTracks.find((t) => t.id === focusTrackId);
    if (!track) return null;
    return trackBoundsLngLat(track.gpx);
  }, [focusTrackId, storedTracks]);

  const focusPlace = useCallback((id: string) => {
    setFocusPlaceId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("place", id);
      window.history.replaceState(null, "", url);
    }
  }, []);

  const focusTrack = useCallback((id: string) => {
    setFocusTrackId(id);
    setFocusTrackGeneration((n) => n + 1);
    setVisibleTrackIds((s) => new Set(s).add(id));
    startTransition(() => setPanelTab("tracks"));
  }, []);

  const togglePanel = useCallback(() => {
    startTransition(() => setPanelOpen((v) => !v));
  }, []);

  const selectPanelTab = useCallback((tab: PanelTab) => {
    startTransition(() => setPanelTab(tab));
  }, []);

  const selectRegion = useCallback((value: string) => {
    startTransition(() => setRegion(value));
  }, []);

  const selectCategory = useCallback((value: string) => {
    startTransition(() => setCategory(value));
  }, []);

  const selectRouteProfile = useCallback((profile: RouteProfile) => {
    startTransition(() => setRouteProfile(profile));
  }, []);

  const togglePickDestMode = useCallback(() => {
    startTransition(() => setPickDestMode((v) => !v));
  }, []);

  const startRecording = useCallback(() => {
    setLivePoints([]);
    setRecordingError(null);
    setRecordingCaps(getTrackRecordingCapabilities());
    setRecording(true);
    startTransition(() => {
      setPanelTab("tracks");
      setPanelOpen(true);
    });
    stopTrackRecordingRef.current = startTrackRecording({
      onPoint: () => {
        setLivePoints(readRecordingBuffer());
      },
      onError: (message) => setRecordingError(message),
    });
  }, []);

  const stopRecording = useCallback(() => {
    const pts = stopTrackRecordingRef.current?.() ?? readRecordingBuffer();
    stopTrackRecordingRef.current = null;
    setRecording(false);
    setRecordingCaps(null);
    setRecordingError(null);
    setLivePoints([]);

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
  }, []);

  useEffect(() => {
    if (!recording) return;
    const syncFromBuffer = () => {
      if (document.visibilityState === "visible") {
        setLivePoints(readRecordingBuffer());
      }
    };
    document.addEventListener("visibilitychange", syncFromBuffer);
    return () => document.removeEventListener("visibilitychange", syncFromBuffer);
  }, [recording]);

  useEffect(() => {
    return () => {
      stopTrackRecordingRef.current?.();
      stopTrackRecordingRef.current = null;
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
    startTransition(() => {
      setPanelTab("tracks");
      setPanelOpen(true);
    });
  }

  async function resolveRouteOrigin(): Promise<{ lat: number; lng: number }> {
    const platform = await PlatformLocation.getCurrentPosition();
    if (platform.ok) {
      return { lat: platform.value.lat, lng: platform.value.lng };
    }
    try {
      return await getCurrentPosition();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as GeolocationPositionError).code
          : null;
      if (code === 1) {
        throw new Error("Разрешите доступ к геолокации для построения маршрута");
      }
      if (code === 3) {
        throw new Error("Не удалось определить местоположение — попробуйте ещё раз");
      }
      throw new Error(platform.message ?? "Не удалось определить ваше местоположение");
    }
  }

  const buildRoute = useCallback(async (dest?: { lat: number; lng: number }) => {
    setRouteError(null);
    setRouteWarning(null);
    setRouteFootNote(null);
    setRouteLoading(true);
    try {
      const place = routeDestId
        ? (getKzPlaceById(routeDestId) ?? mergedPlaces.find((p) => p.id === routeDestId) ?? null)
        : null;
      const to =
        dest ??
        (routeDestPoint ? { lat: routeDestPoint.lat, lng: routeDestPoint.lng } : null) ??
        (place ? { lat: place.lat, lng: place.lng } : null);
      if (!to) throw new Error("Выберите пункт назначения или укажите точку на карте");

      const from = await resolveRouteOrigin();
      const result = await fetchRoute(from, to, routeProfile);
      setRouteLines(routeResultToLines(result));
      setRouteInfo({
        distanceM: result.distanceM,
        durationSec: result.durationSec,
        segments: result.segments,
      });
      setRouteFootNote(result.footTransferNote ?? null);
      setRouteWarning(
        result.warning ??
          (result.viaKzCorridor
            ? "Маршрут проложен через крупные города РК (Астана, Актау и др.) — без объезда через соседние страны."
            : null),
      );
      setPickDestMode(false);
      startTransition(() => {
        setPanelTab("route");
        setPanelOpen(true);
      });
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "Ошибка маршрута");
      setRouteLines(null);
      setRouteInfo(null);
      setRouteFootNote(null);
      setRouteWarning(null);
    } finally {
      setRouteLoading(false);
    }
  }, [mergedPlaces, routeDestId, routeDestPoint, routeProfile]);

  const routeToTrackPoint = useCallback((
    track: StoredTrack,
    which: "start" | "end",
  ) => {
    const endpoints = trackEndpoints(track.gpx);
    if (!endpoints) {
      setTrackActionMsg("Не удалось прочитать точки трека");
      return;
    }
    const point = which === "start" ? endpoints.start : endpoints.end;
    const label =
      which === "start"
        ? `Начало: ${track.name}`
        : `Конец: ${track.name}`;
    setRouteDestId("");
    setRouteDestPoint({ lat: point.lat, lng: point.lng, label });
    setPickDestMode(false);
    startTransition(() => {
      setPanelTab("route");
      setPanelOpen(true);
    });
    void buildRoute({ lat: point.lat, lng: point.lng });
  }, [buildRoute]);

  const handleMapPick = useCallback((coords: { lat: number; lng: number }) => {
    setRouteDestId("");
    setRouteDestPoint({
      lat: coords.lat,
      lng: coords.lng,
      label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    });
    setPickDestMode(false);
    startTransition(() => {
      setPanelTab("route");
      setPanelOpen(true);
    });
  }, []);

  async function snapTrack(track: StoredTrack) {
    setTrackActionMsg(null);
    setSnapLoadingId(track.id);
    try {
      const parsed = parseGpx(track.gpx);
      const coords = parsed.points.map((p) => [p.lng, p.lat] as [number, number]);
      const snapped = await snapTrackToRoads(coords, "foot");
      const snappedPoints = snapped.coordinates.map(([lng, lat], i) => ({
        lat,
        lng,
        ts: parsed.points[Math.min(i, parsed.points.length - 1)]?.ts ?? Date.now(),
      }));
      const gpx = buildGpx(`${track.name} (snap)`, snappedPoints);
      const updated: StoredTrack = {
        ...track,
        name: `${track.name} (snap)`,
        gpx,
        distanceM: snapped.distanceM,
      };
      saveStoredTrack(updated);
      trackLineCacheRef.current.delete(track.id);
      setStoredTracks(listStoredTracks());
      setVisibleTrackIds((s) => new Set(s).add(updated.id));
      setTrackActionMsg("Трек привязан к дорогам");
    } catch (e) {
      setTrackActionMsg(e instanceof Error ? e.message : "Ошибка snap");
    } finally {
      setSnapLoadingId(null);
    }
  }

  async function syncTrack(track: StoredTrack) {
    setTrackActionMsg(null);
    try {
      await syncTrackToServer(track);
      setTrackActionMsg("Трек отправлен на синхронизацию");
    } catch (e) {
      setTrackActionMsg(e instanceof Error ? e.message : "Ошибка синхронизации");
    }
  }

  const handleRouteToPlace = useCallback((place: PlacePin | KzPlace) => {
    setRouteDestId(place.id);
    setRouteDestPoint(null);
    setPickDestMode(false);
    startTransition(() => {
      setPanelTab("route");
      setPanelOpen(true);
    });
    void buildRoute({ lat: place.lat, lng: place.lng });
  }, [buildRoute]);

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
            {recording
              ? `${recordingCaps?.label ?? "Запись"} · ${livePoints.length} точек`
              : `${filteredPlaces.length} мест`}
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
          onClick={togglePanel}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 shrink-0"
        >
          {panelOpen ? "Скрыть" : "Панель"}
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        <KzMapView
          places={filteredPlaces}
          focusPlaceId={focusPlaceId}
          focusTrackBounds={focusTrackBounds}
          focusTrackGeneration={focusTrackGeneration}
          trackLines={trackLines}
          routeLines={routeLines}
          liveTrackPoints={livePoints}
          onRouteToPlace={handleRouteToPlace}
          offlinePmtilesUrl={isOffline ? offlinePmtilesUrl : null}
          pickDestMode={pickDestMode}
          destMarker={routeDestPoint}
          onMapPick={handleMapPick}
          className="absolute inset-0"
        />

        {isOffline && (
          <div className="absolute top-3 left-3 right-3 z-10 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            Офлайн-режим: места и треки доступны
            {offlinePmtilesUrl ? " · карта региона загружена" : " · скачайте регион в «Офлайн-карты»"}
          </div>
        )}

        {recording && recordingCaps?.warning && (
          <div className="absolute top-3 left-3 right-3 z-10 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            {recordingCaps.warning}
          </div>
        )}

        {recording && (
          <div
            className={`absolute left-3 z-10 rounded-xl bg-red-600 text-white px-3 py-2 text-xs font-medium shadow ${
              recordingCaps?.warning ? "top-20" : "top-3"
            }`}
          >
            {livePoints.length > 0
              ? `${formatDistance(trackDistanceM(livePoints))} · ${livePoints.length} точек`
              : `Ожидание GPS… · ${livePoints.length} точек`}
          </div>
        )}

        {recordingError && (
          <div className="absolute top-3 right-3 z-10 max-w-[60%] rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {recordingError}
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
                  onClick={() => selectPanelTab(id)}
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
                    onChange={(e) => selectRegion(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <option value="">Все регионы</option>
                    {PLACES_INDEX.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={category}
                    onChange={(e) => selectCategory(e.target.value)}
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
                {recording && recordingCaps && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    {recordingCaps.label}. Точки: {livePoints.length}. На подъёме учитывается высота и
                    интервал до 12 сек.
                  </p>
                )}
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

                {trackActionMsg && (
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{trackActionMsg}</p>
                )}

                <ul className="space-y-2">
                  {storedTracks.map((t) => (
                    <li
                      key={t.id}
                      className={`rounded-xl border px-3 py-2.5 space-y-2 ${
                        focusTrackId === t.id
                          ? "border-orange-400 bg-orange-50/50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={visibleTrackIds.has(t.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setVisibleTrackIds((s) => {
                              const next = new Set(s);
                              if (checked) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            });
                            if (checked) {
                              focusTrack(t.id);
                            } else if (focusTrackId === t.id) {
                              setFocusTrackId(null);
                            }
                          }}
                          className="shrink-0"
                          aria-label={`Показать ${t.name} на карте`}
                        />
                        <button
                          type="button"
                          onClick={() => focusTrack(t.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p
                            className={`text-sm font-medium truncate ${
                              focusTrackId === t.id ? "text-orange-900" : ""
                            }`}
                          >
                            {t.name}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {formatDistance(t.distanceM)} · {formatDuration(t.durationSec)}
                            {isTrackSynced(t.id) ? " · ☁" : ""}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteStoredTrack(t.id);
                            if (focusTrackId === t.id) setFocusTrackId(null);
                            trackLineCacheRef.current.delete(t.id);
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
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-1 pl-6">
                      <button
                        type="button"
                        disabled={snapLoadingId === t.id}
                        onClick={() => void snapTrack(t)}
                        className="shrink-0 text-[10px] text-violet-700 font-medium"
                      >
                        Snap
                      </button>
                      <button
                        type="button"
                        onClick={() => routeToTrackPoint(t, "start")}
                        className="shrink-0 text-[10px] text-sky-700 font-medium"
                        title="Маршрут к началу трека"
                      >
                        К началу
                      </button>
                      <button
                        type="button"
                        onClick={() => routeToTrackPoint(t, "end")}
                        className="shrink-0 text-[10px] text-sky-700 font-medium"
                        title="Маршрут к концу трека"
                      >
                        К концу
                      </button>
                      <button
                        type="button"
                        onClick={() => void syncTrack(t)}
                        className="shrink-0 text-[10px] text-emerald-700 font-medium"
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadGpx(t.name, t.gpx)}
                        className="shrink-0 text-[10px] text-gray-700 font-medium"
                        title="Скачать GPX"
                      >
                        Скачать
                      </button>
                      <button
                        type="button"
                        onClick={() => shareGpx(t.name, t.gpx)}
                        className="shrink-0 text-[10px] text-sky-700 font-medium"
                        title="Поделиться GPX"
                      >
                        Поделиться
                      </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {panelTab === "route" && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <p className="text-xs text-gray-600">
                  Маршрут от вашей геолокации до места из каталога, точки на карте или начала/конца
                  трека (OSRM + обход через хабы РК).
                </p>
                <select
                  value={routeDestId}
                  onChange={(e) => {
                    setRouteDestId(e.target.value);
                    setRouteDestPoint(null);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <option value="">Место из каталога…</option>
                  {mergedPlaces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={togglePickDestMode}
                  className={`w-full rounded-xl py-2.5 text-sm font-semibold ${
                    pickDestMode
                      ? "bg-sky-600 text-white"
                      : "border border-dashed border-sky-300 text-sky-700 bg-sky-50"
                  }`}
                >
                  {pickDestMode ? "Отмена выбора на карте" : "Указать точку на карте"}
                </button>
                {routeDestPoint && (
                  <p className="text-xs text-sky-800 bg-sky-50 rounded-lg px-3 py-2">
                    Точка: {routeDestPoint.label}
                  </p>
                )}
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
                      onClick={() => selectRouteProfile(id)}
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
                  disabled={(!routeDestId && !routeDestPoint) || routeLoading}
                  onClick={() => void buildRoute()}
                  className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {routeLoading ? "Построение…" : "Построить маршрут"}
                </button>
                {routeError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{routeError}</p>
                )}
                {routeInfo && (
                  <div className="text-sm text-gray-800 bg-sky-50 rounded-xl px-3 py-2 space-y-1">
                    <p>
                      {formatDistance(routeInfo.distanceM)} · ~{formatDuration(routeInfo.durationSec)}
                    </p>
                    {routeInfo.segments && routeInfo.segments.length > 1 && (
                      <p className="text-xs text-gray-600">
                        {routeInfo.segments
                          .map(
                            (seg) =>
                              `${formatDistance(seg.distanceM)} ${ROUTE_PROFILE_LABELS[seg.profile]}`,
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                )}
                {routeFootNote && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    {routeFootNote}
                  </p>
                )}
                {routeWarning && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {routeWarning}
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
