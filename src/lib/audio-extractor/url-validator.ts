import type { AudioPlatform } from "./types";

const ALLOWED_HOSTS: Record<AudioPlatform, RegExp[]> = {
  youtube: [
    /^([a-z0-9-]+\.)?youtube\.com$/i,
    /^youtu\.be$/i,
  ],
  tiktok: [
    /^([a-z0-9-]+\.)?tiktok\.com$/i,
    /^vm\.tiktok\.com$/i,
  ],
  instagram: [
    /^([a-z0-9-]+\.)?instagram\.com$/i,
  ],
};

function hostMatches(host: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(host));
}

export function detectPlatform(url: URL): AudioPlatform | null {
  const host = url.hostname.replace(/^www\./i, "");
  if (hostMatches(host, ALLOWED_HOSTS.youtube)) return "youtube";
  if (hostMatches(host, ALLOWED_HOSTS.tiktok)) return "tiktok";
  if (hostMatches(host, ALLOWED_HOSTS.instagram)) return "instagram";
  return null;
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "si" || key === "feature") {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function validateExtractorUrl(raw: string): { url: string; platform: AudioPlatform } {
  let normalized: string;
  try {
    normalized = normalizeUrl(raw);
  } catch {
    throw new Error("invalid_url");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("invalid_url");
  }

  const platform = detectPlatform(parsed);
  if (!platform) throw new Error("unsupported_platform");

  if (platform === "instagram") {
    const path = parsed.pathname.toLowerCase();
    if (!path.includes("/reel/") && !path.includes("/p/") && !path.includes("/tv/")) {
      throw new Error("unsupported_instagram_url");
    }
  }

  return { url: normalized, platform };
}
