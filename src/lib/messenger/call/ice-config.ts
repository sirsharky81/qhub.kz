import type { RTCIceServer } from "./types";

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

function parseTurnUrlsEnv(): RTCIceServer[] {
  const raw = process.env.MESSENGER_TURN_URLS?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.urls === "string");
  } catch {
    return [];
  }
}

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

/** Server-side ICE config for authenticated clients (keeps TURN creds off the bundle). */
export function getServerIceServers(): RTCIceServer[] {
  const turn = parseTurnUrlsEnv();
  const username = process.env.MESSENGER_TURN_USERNAME?.trim();
  const credential = process.env.MESSENGER_TURN_CREDENTIAL?.trim();

  if (turn.length > 0 && username && credential) {
    return [
      ...DEFAULT_STUN,
      ...turn.map((s) => ({ ...s, username, credential })),
    ];
  }

  return [...DEFAULT_STUN, ...FALLBACK_TURN];
}
