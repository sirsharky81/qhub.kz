import type { RTCIceServer } from "./types";

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

const FALLBACK_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const METERED_CACHE_TTL_MS = 5 * 60 * 1000;
const METERED_FAILURE_CACHE_MS = 30 * 1000;
let meteredCache: { servers: RTCIceServer[]; expiresAt: number } | null = null;
let meteredFailureUntil = 0;
let meteredInFlight: Promise<RTCIceServer[] | null> | null = null;

function parseTurnUrlsEnv(): RTCIceServer[] {
  const raw = process.env.MESSENGER_TURN_URLS?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => s && s.urls);
    }
  } catch {
    // comma-separated turn:/stun:/turns: URLs
  }

  const urls = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("turn:") || part.startsWith("turns:") || part.startsWith("stun:"));

  if (urls.length === 0) return [];
  return [{ urls: urls.length === 1 ? urls[0]! : urls }];
}

function staticTurnServers(): RTCIceServer[] {
  const turn = parseTurnUrlsEnv();
  const username = process.env.MESSENGER_TURN_USERNAME?.trim();
  const credential = process.env.MESSENGER_TURN_CREDENTIAL?.trim();

  if (turn.length > 0 && username && credential) {
    return turn.map((s) => ({ ...s, username, credential }));
  }
  return [];
}

function meteredAppDomain(): string {
  const raw = process.env.MESSENGER_METERED_DOMAIN?.trim() || "qhubkz";
  return (
    raw
      .replace(/^https?:\/\//i, "")
      .replace(/\.metered\.live\/?.*$/i, "")
      .split("/")[0] || "qhubkz"
  );
}

function meteredApiKey(): string | undefined {
  return (
    process.env.MESSENGER_METERED_TURN_API_KEY?.trim() ||
    process.env.MESSENGER_METERED_API_KEY?.trim() ||
    process.env.MESSENGER_TURN_API_KEY?.trim() ||
    undefined
  );
}

async function fetchMeteredIceServers(): Promise<RTCIceServer[] | null> {
  const domain = meteredAppDomain();
  const apiKey = meteredApiKey();
  if (!domain || !apiKey) return null;

  const now = Date.now();
  if (meteredCache && meteredCache.expiresAt > now) {
    return meteredCache.servers;
  }
  if (meteredFailureUntil > now) {
    return meteredCache?.servers ?? null;
  }
  if (meteredInFlight) return meteredInFlight;

  meteredInFlight = (async () => {
    const url = new URL(`https://${domain}.metered.live/api/v1/turn/credentials`);
    url.searchParams.set("apiKey", apiKey);
    const region = process.env.MESSENGER_METERED_REGION?.trim();
    if (region) url.searchParams.set("region", region);

    try {
      // Do not let a third-party credential endpoint consume most of the call
      // setup budget. A stale credential set or the configured fallback TURN
      // is preferable to four seconds of silence before createOffer.
      const res = await fetch(url.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const iceServers = (await res.json()) as RTCIceServer[];
      if (!Array.isArray(iceServers) || iceServers.length === 0) {
        throw new Error("empty iceServers");
      }

      meteredCache = { servers: iceServers, expiresAt: now + METERED_CACHE_TTL_MS };
      meteredFailureUntil = 0;
      return iceServers;
    } catch (err) {
      meteredFailureUntil = Date.now() + METERED_FAILURE_CACHE_MS;
      console.error("[ice-config] Metered API error:", err);
      return meteredCache?.servers ?? null;
    }
  })().finally(() => {
    meteredInFlight = null;
  });
  return meteredInFlight;
}

/** Server-side ICE config (TURN creds stay off the client bundle). */
export async function getServerIceServers(): Promise<{
  iceServers: RTCIceServer[];
  turnSource: "metered" | "static" | "fallback";
}> {
  const staticTurn = staticTurnServers();
  if (staticTurn.length > 0) {
    return { iceServers: [...DEFAULT_STUN, ...staticTurn], turnSource: "static" };
  }

  const metered = await fetchMeteredIceServers();
  if (metered?.length) {
    return { iceServers: metered, turnSource: "metered" };
  }

  return { iceServers: [...DEFAULT_STUN, ...FALLBACK_TURN], turnSource: "fallback" };
}
