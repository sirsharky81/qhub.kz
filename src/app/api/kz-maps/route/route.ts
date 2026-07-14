import type { RouteProfile } from "@/lib/kz-maps/gpx";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";

const OSRM_BASE =
  process.env.OSRM_URL?.trim().replace(/\/$/, "") || "https://router.project-osrm.org";

const PROFILE_MAP: Record<RouteProfile, string> = {
  foot: "foot",
  car: "driving",
  bike: "bike",
};

function parseCoord(raw: string | null, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Некорректная координата: ${label}`);
  return n;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromLat = parseCoord(searchParams.get("fromLat"), "fromLat");
    const fromLng = parseCoord(searchParams.get("fromLng"), "fromLng");
    const toLat = parseCoord(searchParams.get("toLat"), "toLat");
    const toLng = parseCoord(searchParams.get("toLng"), "toLng");
    const profileRaw = (searchParams.get("profile") ?? "foot") as RouteProfile;
    const osrmProfile = PROFILE_MAP[profileRaw] ?? "foot";

    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `${OSRM_BASE}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url, {
      headers: { "User-Agent": "QHubKZMaps/1.0 (+https://qhub.kz)" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return withCors(
        NextResponse.json({ error: "OSRM недоступен" }, { status: 502 }),
        request,
      );
    }

    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };

    if (data.code !== "Ok" || !data.routes?.[0]) {
      return withCors(
        NextResponse.json({ error: "Маршрут не найден" }, { status: 404 }),
        request,
      );
    }

    const r = data.routes[0];
    return withCors(
      NextResponse.json({
        route: {
          profile: profileRaw,
          distanceM: Math.round(r.distance),
          durationSec: Math.round(r.duration),
          coordinates: r.geometry.coordinates,
        },
      }),
      request,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка маршрута";
    return withCors(NextResponse.json({ error: msg }, { status: 400 }), request);
  }
}
