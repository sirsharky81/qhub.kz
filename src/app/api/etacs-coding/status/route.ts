import { handleCorsPreflight, withCors } from "@/lib/api/cors";
import { isEtacsDictionaryReady } from "@/lib/etacs-coding/datastore";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const ready = isEtacsDictionaryReady() && process.env.ETACS_CODING_ENABLED !== "0";
  return withCors(
    NextResponse.json({ ready }, { headers: { "Cache-Control": "no-store" } }),
    request,
  );
}
