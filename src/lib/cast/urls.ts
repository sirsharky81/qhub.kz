import { CAST_BASE_PATH } from "./constants";

const SEND_PATH_RE = /\/s\/([a-zA-Z0-9_-]+)/;

export function buildCastStreamUrl(token: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/cast/stream/${encodeURIComponent(token)}`;
}

export function buildCastWatchUrl(params: { url?: string; uploadId?: string }, origin?: string): string {
  const base = origin?.replace(/\/$/, "") ?? "";
  const path = `${CAST_BASE_PATH}/watch`;
  const sp = new URLSearchParams();
  if (params.uploadId) sp.set("upload", params.uploadId);
  else if (params.url) sp.set("url", params.url);
  const qs = sp.toString();
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

/** Extract Send shareId from full URL or bare id. */
export function parseSendShareInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{8,32}$/.test(trimmed) && !trimmed.includes("://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(SEND_PATH_RE);
    if (match?.[1]) return match[1];
  } catch {
    const pathMatch = trimmed.match(SEND_PATH_RE);
    if (pathMatch?.[1]) return pathMatch[1];
  }

  return null;
}

export function isCastEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAST_ENABLED !== "0";
}

export function getCastReceiverId(): string {
  return process.env.NEXT_PUBLIC_CAST_RECEIVER_ID?.trim() || "CC1AD845";
}
