import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "WebSocket upgrade is not available in this deployment mode. Use rooms polling endpoints as transport fallback.",
    },
    { status: 426 },
  );
}
