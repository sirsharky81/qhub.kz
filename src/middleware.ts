import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";
import { verifySessionToken } from "@/lib/admin/session-crypto";
import { shouldHideDevOnlyApps } from "@/lib/admin/runtime";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const panelBase = `/${ADMIN_PANEL_PATH}`;
  const host = request.headers.get("host");

  if (pathname.startsWith(panelBase)) {
    const loginPath = `${panelBase}/login`;
    if (pathname === loginPath) {
      return NextResponse.next();
    }
    const token = request.cookies.get("qhub_admin_session")?.value;
    if (!token || !(await verifySessionToken(token))) {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Must stay in sync with ADMIN_PANEL_PATH in constants.ts (static string required by Next.js)
    "/qhub-ctrl-7k2m/:path*",
    "/tools/audio-extractor/:path*",
    "/api/audio-extractor/:path*",
  ],
};
