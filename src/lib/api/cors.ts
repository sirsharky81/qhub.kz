import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://qhub.kz",
  "https://www.qhub.kz",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
];

export function corsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return null;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = corsOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Family-Member-Id, X-Family-Access-Token, X-Split-Member-Id, X-Split-Access-Token, X-Share-Participant-Id, X-Share-Access-Token, X-QHub-Client",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function apiMiddlewareCors(request: NextRequest): NextResponse | null {
  const preflight = handleCorsPreflight(request);
  if (preflight) {
    return new NextResponse(null, { status: 204, headers: preflight.headers });
  }
  return null;
}

export function applyCorsToNextResponse(response: NextResponse, request: NextRequest): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    response.headers.set(k, v);
  }
  return response;
}
