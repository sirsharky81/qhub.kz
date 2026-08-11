const DEFAULT_PUBLIC_ORIGIN = "https://www.qhub.kz";

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Public site origin for shareable links (Send, Share invites, etc.). */
export function getPublicOrigin(request?: Request): string {
  const fromEnv =
    process.env.QHUB_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";

    if (forwardedHost && !isLocalHostname(forwardedHost.split(":")[0] ?? "")) {
      return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
    }

    const host = request.headers.get("host")?.trim();
    if (host && !isLocalHostname(host.split(":")[0] ?? "")) {
      const proto = host.includes("localhost") ? "http" : forwardedProto;
      return normalizeOrigin(`${proto}://${host}`);
    }

    try {
      const urlOrigin = new URL(request.url).origin;
      if (!isLocalHostname(new URL(urlOrigin).hostname)) {
        return normalizeOrigin(urlOrigin);
      }
    } catch {
      /* ignore */
    }

    if (process.env.NODE_ENV === "development") {
      try {
        return normalizeOrigin(new URL(request.url).origin);
      } catch {
        /* ignore */
      }
    }
  }

  return DEFAULT_PUBLIC_ORIGIN;
}
