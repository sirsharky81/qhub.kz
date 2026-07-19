import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getKzPlacesByRegion } from "@/lib/kz-maps/places";
import { getKzRegionBundle } from "@/lib/kz-maps/regions";

export async function GET(
  request: Request,
  context: { params: Promise<{ region: string }> },
) {
  const { region } = await context.params;
  const bundle = getKzRegionBundle(region);
  if (!bundle) {
    return withCors(NextResponse.json({ error: "Регион не найден" }, { status: 404 }), request);
  }

  const places = getKzPlacesByRegion(region);
  return withCors(
    NextResponse.json({
      region: bundle.id,
      name: bundle.name,
      updatedAt: bundle.updatedAt,
      places,
    }),
    request,
  );
}
