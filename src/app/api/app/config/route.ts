import { NextResponse } from "next/server";
import { withCors } from "@/lib/api/cors";

export async function GET(request: Request) {
  return withCors(
    NextResponse.json({
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      minimumSupportedVersion: process.env.APP_MINIMUM_SUPPORTED_VERSION ?? "0.1.0",
      latestVersion: process.env.APP_LATEST_VERSION ?? "0.1.0",
      remoteFlags: {
        enable_background_location: process.env.FLAG_BACKGROUND_LOCATION !== "false",
        enable_native_push: process.env.FLAG_NATIVE_PUSH !== "false",
      },
    }),
    request,
  );
}
