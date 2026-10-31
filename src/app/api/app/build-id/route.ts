import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";
import { readNextBuildId } from "@/lib/obd-diag/read-build-id";

export async function GET(request: Request) {
  return withCors(
    NextResponse.json(
      { buildId: readNextBuildId() },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    ),
    request,
  );
}
