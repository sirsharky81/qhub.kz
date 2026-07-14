import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getKzPlaceById, getKzPlacesNearby, searchKzPlaces } from "@/lib/kz-maps/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const place = getKzPlaceById(id);
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
    const places = getKzPlacesNearby(lat, lng, radiusKm);
    return withCors(NextResponse.json({ places }), request);
  }

  const places = searchKzPlaces({
    region: searchParams.get("region"),
    category: searchParams.get("category"),
    q: searchParams.get("q"),
  });

  return withCors(NextResponse.json({ places }), request);
}
