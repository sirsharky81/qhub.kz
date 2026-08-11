import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";
import { verifySessionToken } from "@/lib/admin/session-crypto";
import { shouldHideDevOnlyApps } from "@/lib/admin/runtime";
import { apiMiddlewareCors, applyCorsToNextResponse } from "@/lib/api/cors";

/** PWA assets must stay public — iOS/Android refuse install if manifest/icons redirect to login. */
function isAdminPublicPath(pathname: string, panelBase: string): boolean {
  if (pathname === `${panelBase}/login`) return true;
  if (pathname === `${panelBase}/manifest.json`) return true;
  if (pathname === `${panelBase}/apple-touch-icon.png`) return true;
  if (pathname.startsWith(`${panelBase}/icon`)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const corsResponse = apiMiddlewareCors(request);
    if (corsResponse) return corsResponse;
  }

  const panelBase = `/${ADMIN_PANEL_PATH}`;
  const host = request.headers.get("host");

  if (pathname.startsWith(panelBase)) {
    const loginPath = `${panelBase}/login`;
    if (isAdminPublicPath(pathname, panelBase)) {
      return NextResponse.next();
    }
    try {
      const token = request.cookies.get("qhub_admin_session")?.value;
      if (!token || !(await verifySessionToken(token))) {
        return NextResponse.redirect(new URL(loginPath, request.url));
      }
    } catch {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/tools/audio-extractor") && shouldHideDevOnlyApps(host)) {
    const token = request.cookies.get("qhub_admin_session")?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (pathname.startsWith("/api/audio-extractor") && shouldHideDevOnlyApps(host)) {
    const token = request.cookies.get("qhub_admin_session")?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "Недоступно" }, { status: 404 });
    }
  }

  return applyCorsToNextResponse(NextResponse.next(), request);
}

export const config = {
  matcher: [
    // Skip /api/send/* — large multipart uploads must not be body-buffered by middleware
    // (default 10MB truncate → FormData "expected boundary" → false "NAS" errors).
    "/api/((?!send(?:/|$)).*)",
    // Must stay in sync with ADMIN_PANEL_PATH in constants.ts (static string required by Next.js)
    "/qhub-ctrl-7k2m/:path*",
    "/tools/audio-extractor/:path*",
  ],
};
