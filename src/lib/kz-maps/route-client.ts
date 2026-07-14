import type { RouteProfile, RouteResult } from "./gpx";

const OSRM_PROFILE: Record<RouteProfile, string> = {
  foot: "walking",
  car: "driving",
  bike: "cycling",
};

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: RouteProfile,
): Promise<RouteResult> {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLng: String(from.lng),
    toLat: String(to.lat),
    toLng: String(to.lng),
    profile,
  });
  const res = await fetch(`/api/kz-maps/route?${params}`);
  const data = (await res.json()) as { error?: string; route?: RouteResult };
  if (!res.ok) throw new Error(data.error ?? "Не удалось построить маршрут");
  if (!data.route) throw new Error("Пустой ответ маршрута");
  return data.route;
}

export { OSRM_PROFILE };
