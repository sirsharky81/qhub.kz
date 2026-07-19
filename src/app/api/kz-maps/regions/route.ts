import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { getKzRegionBundles } from "@/lib/kz-maps/regions";

export async function GET(request: Request) {
  return withCors(NextResponse.json({ bundles: getKzRegionBundles() }), request);
}
