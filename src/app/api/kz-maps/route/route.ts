import type { RouteProfile, RouteSegment } from "@/lib/kz-maps/gpx";
import {
  bothPointsInKz,
  buildOsrmCoordString,
  getKzViaWaypoints,
  routeExitsKz,
} from "@/lib/kz-maps/route-kz";
import { appendFootTransferIfNeeded } from "@/lib/kz-maps/route-transfer";
import { OSRM_PROFILE } from "@/lib/kz-maps/route-client";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";

const OSRM_BASE =
  process.env.OSRM_URL?.trim().replace(/\/$/, "") || "https://router.project-osrm.org";

function parseCoord(raw: string | null, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Некорректная координата: ${label}`);
  return n;
}

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
};

async function fetchOsrmRoute(
  coordString: string,
  osrmProfile: string,
): Promise<{ ok: true; route: OsrmRoute } | { ok: false; status: number; error: string }> {
  const url = `${OSRM_BASE}/route/v1/${osrmProfile}/${coordString}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "QHubKZMaps/1.0 (+https://qhub.kz)" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return { ok: false, status: 502, error: "OSRM недоступен" };
  }

  const data = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
  if (data.code !== "Ok" || !data.routes?.[0]) {
    return { ok: false, status: 404, error: "Маршрут не найден" };
  }

  return { ok: true, route: data.routes[0] };
}

async function resolveVehicleRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  osrmProfile: string,
): Promise<
  | { ok: true; route: OsrmRoute; viaKzCorridor: boolean; warning?: string }
  | { ok: false; status: number; error: string }
> {
  let viaKzCorridor = false;
  let warning: string | undefined;

  let result = await fetchOsrmRoute(buildOsrmCoordString(from, to), osrmProfile);

  if (
    result.ok &&
    bothPointsInKz(from, to) &&
    routeExitsKz(result.route.geometry.coordinates)
  ) {
    const vias = getKzViaWaypoints(from, to);
    if (vias.length > 0) {
      const retry = await fetchOsrmRoute(buildOsrmCoordString(from, to, vias), osrmProfile);
      if (retry.ok && !routeExitsKz(retry.route.geometry.coordinates)) {
        result = retry;
        viaKzCorridor = true;
      } else if (retry.ok) {
        result = retry;
        viaKzCorridor = true;
        warning =
          "Маршрут может частично проходить за пределами РК — в OSM неполная сеть дорог. Проверьте трассы на месте.";
      }
    } else {
      warning =
        "Маршрут выходит за пределы Казахстана из‑за пробелов в карте OSM. Для точных маршрутов по РК нужен свой OSRM-сервер.";
    }
  }

  if (!result.ok) return result;
  return { ok: true, route: result.route, viaKzCorridor, warning };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromLat = parseCoord(searchParams.get("fromLat"), "fromLat");
    const fromLng = parseCoord(searchParams.get("fromLng"), "fromLng");
    const toLat = parseCoord(searchParams.get("toLat"), "toLat");
    const toLng = parseCoord(searchParams.get("toLng"), "toLng");
    const profileRaw = (searchParams.get("profile") ?? "foot") as RouteProfile;
    const osrmProfile = OSRM_PROFILE[profileRaw] ?? "walking";

    const from = { lat: fromLat, lng: fromLng };
    const to = { lat: toLat, lng: toLng };

    const resolved = await resolveVehicleRoute(from, to, osrmProfile);
    if (!resolved.ok) {
      return withCors(NextResponse.json({ error: resolved.error }, { status: resolved.status }), request);
    }

    let viaKzCorridor = resolved.viaKzCorridor;
    let warning = resolved.warning;
    let footTransferNote: string | undefined;

    let coordinates = resolved.route.geometry.coordinates;
    let distanceM = Math.round(resolved.route.distance);
    let durationSec = Math.round(resolved.route.duration);
    let segments: RouteSegment[] | undefined;

    if (profileRaw === "car" || profileRaw === "bike") {
      const withFoot = await appendFootTransferIfNeeded(
        resolved.route,
        to,
        profileRaw,
        async (roadEnd, dest) => {
          const foot = await fetchOsrmRoute(
            `${roadEnd[0]},${roadEnd[1]};${dest.lng},${dest.lat}`,
            "walking",
          );
          return foot.ok ? foot.route : null;
        },
      );
      coordinates = withFoot.coordinates;
      distanceM = withFoot.distanceM;
      durationSec = withFoot.durationSec;
      segments = withFoot.segments;
      footTransferNote = withFoot.footTransferNote;
    }

    return withCors(
      NextResponse.json({
        route: {
          profile: profileRaw,
          distanceM,
          durationSec,
          coordinates,
          segments,
          viaKzCorridor,
          warning,
          footTransferNote,
        },
      }),
      request,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка маршрута";
    return withCors(NextResponse.json({ error: msg }, { status: 400 }), request);
  }
}
