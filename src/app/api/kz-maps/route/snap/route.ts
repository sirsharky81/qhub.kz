import type { RouteProfile } from "@/lib/kz-maps/gpx";
import { OSRM_PROFILE } from "@/lib/kz-maps/route-client";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";

const OSRM_BASE =
  process.env.OSRM_URL?.trim().replace(/\/$/, "") || "https://router.project-osrm.org";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: RouteProfile;
      coordinates?: [number, number][];
    };

    const profileRaw = body.profile ?? "foot";
    const osrmProfile = OSRM_PROFILE[profileRaw] ?? "walking";
    const coords = body.coordinates;

    if (!coords || coords.length < 2) {
      return withCors(
        NextResponse.json({ error: "Нужно минимум 2 точки" }, { status: 400 }),
        request,
      );
    }

    const maxPoints = 100;
    const step = Math.max(1, Math.ceil(coords.length / maxPoints));
    const sampled: [number, number][] = [];
    for (let i = 0; i < coords.length; i += step) {
      sampled.push(coords[i]!);
    }
    const last = coords[coords.length - 1]!;
    if (sampled[sampled.length - 1] !== last) sampled.push(last);

    const coordStr = sampled.map(([lng, lat]) => `${lng},${lat}`).join(";");
    const url = `${OSRM_BASE}/match/v1/${osrmProfile}/${coordStr}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url, {
      headers: { "User-Agent": "QHubKZMaps/1.0 (+https://qhub.kz)" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return withCors(NextResponse.json({ error: "OSRM match недоступен" }, { status: 502 }), request);
    }

    const data = (await res.json()) as {
      code?: string;
      matchings?: Array<{
        distance: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };

    if (data.code !== "Ok" || !data.matchings?.[0]) {
      return withCors(NextResponse.json({ error: "Не удалось привязать к дорогам" }, { status: 404 }), request);
    }

    const m = data.matchings[0];
    return withCors(
      NextResponse.json({
        snap: {
          distanceM: Math.round(m.distance),
          coordinates: m.geometry.coordinates,
        },
      }),
      request,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка snap";
    return withCors(NextResponse.json({ error: msg }, { status: 400 }), request);
  }
}
