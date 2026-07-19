import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getKzPlaceById, getKzPlacesNearby, searchKzPlaces } from "@/lib/kz-maps/places";
import { listCommunityPlaces } from "@/lib/kz-maps/pending-store";
import type { KzPlace } from "@/lib/kz-maps/types";

async function mergeCommunityPlaces(places: KzPlace[]): Promise<KzPlace[]> {
  try {
    const community = await listCommunityPlaces();
    const seen = new Set(places.map((p) => p.id));
    const merged = [...places];
    for (const p of community) {
      if (!seen.has(p.id)) merged.push(p);
    }
    return merged;
  } catch {
    return places;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    let place = getKzPlaceById(id);
    if (!place) {
      const community = await listCommunityPlaces();
      place = community.find((p) => p.id === id) ?? null;
    }
    if (!place) {
      return withCors(NextResponse.json({ error: "Место не найдено" }, { status: 404 }), request);
    }
    return withCors(NextResponse.json({ place }), request);
  }

  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const radiusRaw = searchParams.get("radiusKm");

  if (latRaw != null && lngRaw != null) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const radiusKm = Number(radiusRaw ?? 30);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm)) {
      return withCors(NextResponse.json({ error: "Некорректные координаты" }, { status: 400 }), request);
    }
    const places = await mergeCommunityPlaces(getKzPlacesNearby(lat, lng, radiusKm));
    return withCors(NextResponse.json({ places }), request);
  }

  const places = await mergeCommunityPlaces(
    searchKzPlaces({
      region: searchParams.get("region"),
      category: searchParams.get("category"),
      q: searchParams.get("q"),
    }),
  );

  return withCors(NextResponse.json({ places }), request);
}
