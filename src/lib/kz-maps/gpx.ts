export interface TrackPoint {
  lat: number;
  lng: number;
  ts: number;
  ele?: number;
}

export type RouteProfile = "foot" | "car" | "bike";

export interface RouteSegment {
  profile: RouteProfile;
  distanceM: number;
  durationSec: number;
  coordinates: [number, number][];
}

export interface ParsedGpxTrack {
  name: string;
  points: TrackPoint[];
  distanceM: number;
  durationSec: number;
}

export interface StoredTrack {
  id: string;
  name: string;
  createdAt: number;
  distanceM: number;
  durationSec: number;
  gpx: string;
}

export interface RouteResult {
  profile: RouteProfile;
  distanceM: number;
  durationSec: number;
  coordinates: [number, number][];
  segments?: RouteSegment[];
  viaKzCorridor?: boolean;
  warning?: string;
  footTransferNote?: string;
}

const EARTH_R = 6371000;

function haversineM(a: TrackPoint, b: TrackPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function trackDistanceM(points: TrackPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineM(points[i - 1]!, points[i]!);
  return Math.round(sum);
}

export function trackDurationSec(points: TrackPoint[]): number {
  if (points.length < 2) return 0;
  const start = points[0]!.ts;
  const end = points[points.length - 1]!.ts;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} км`;
  return `${Math.round(m)} м`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGpx(name: string, points: TrackPoint[]): string {
  const pts = points
    .map((p) => {
      const time = new Date(p.ts).toISOString();
      const ele = p.ele != null ? `<ele>${p.ele}</ele>` : "";
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}<time>${time}</time></trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="QHub KZ Maps" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

export function parseGpx(xml: string): ParsedGpxTrack {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Некорректный GPX-файл");
  }

  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    "Трек";

  const points: TrackPoint[] = [];
  for (const pt of doc.querySelectorAll("trkpt")) {
    const lat = Number(pt.getAttribute("lat"));
    const lng = Number(pt.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const timeRaw = pt.querySelector("time")?.textContent?.trim();
    const ts = timeRaw ? Date.parse(timeRaw) : points.length > 0 ? points[points.length - 1]!.ts + 1000 : Date.now();
    const eleRaw = pt.querySelector("ele")?.textContent?.trim();
    const ele = eleRaw != null ? Number(eleRaw) : undefined;
    points.push({
      lat,
      lng,
      ts: Number.isFinite(ts) ? ts : Date.now(),
      ele: Number.isFinite(ele!) ? ele : undefined,
    });
  }

  if (points.length < 2) {
    throw new Error("В GPX меньше двух точек трека");
  }

  return {
    name,
    points,
    distanceM: trackDistanceM(points),
    durationSec: trackDurationSec(points),
  };
}

export function downloadGpx(filename: string, gpx: string): void {
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const safe = filename.endsWith(".gpx") ? filename : `${filename}.gpx`;
  void import("@/lib/platform/save-file").then(({ downloadBlobDirect }) =>
    downloadBlobDirect(blob, safe),
  );
}

export function shareGpx(filename: string, gpx: string): void {
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const safe = filename.endsWith(".gpx") ? filename : `${filename}.gpx`;
  void import("@/lib/platform/save-file").then(({ saveBlobToDevice }) =>
    saveBlobToDevice(blob, safe),
  );
}

export function trackEndpoints(
  gpx: string,
): { start: TrackPoint; end: TrackPoint } | null {
  try {
    const { points } = parseGpx(gpx);
    if (points.length === 0) return null;
    return { start: points[0]!, end: points[points.length - 1]! };
  } catch {
    return null;
  }
}

export function pointsToLineGeoJson(
  points: TrackPoint[],
  props: Record<string, string | number> = {},
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: props,
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

export function lineFeatureCollection(
  features: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return { type: "FeatureCollection", features };
}
