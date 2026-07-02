import { NextResponse } from "next/server";
import { corsHeaders, handleCorsPreflight } from "@/lib/api/cors";
import { getTurnstilePublicConfig } from "@/lib/captcha/turnstile-config";

export async function OPTIONS(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const config = getTurnstilePublicConfig();
  const response = NextResponse.json(config, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}
