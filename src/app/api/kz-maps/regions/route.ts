import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getKzPlacesIndex } from "@/lib/kz-maps/places";

export async function GET(request: Request) {
  return withCors(NextResponse.json(getKzPlacesIndex()), request);
}
