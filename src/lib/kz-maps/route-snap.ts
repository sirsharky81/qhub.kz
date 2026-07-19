import type { RouteProfile } from "./gpx";

export async function snapTrackToRoads(
  coordinates: [number, number][],
  profile: RouteProfile = "foot",
): Promise<{ coordinates: [number, number][]; distanceM: number }> {
  const res = await fetch("/api/kz-maps/route/snap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, coordinates }),
  });
  const data = (await res.json()) as {
    error?: string;
    snap?: { coordinates: [number, number][]; distanceM: number };
  };
  if (!res.ok) throw new Error(data.error ?? "Snap failed");
  if (!data.snap) throw new Error("Пустой ответ snap");
  return data.snap;
}
