import { platformFetch } from "@/lib/platform/api-client";
import type { CallPollResponse, InitiateCallResponse } from "./types";
import type { CallSignalType } from "../types";

const REQUEST_TIMEOUT_MS = 8000;

/**
 * iOS (especially PWA/standalone) can silently stall an in-flight fetch for a
 * long time — no error, no rejection, it just never settles (e.g. when the
 * app briefly suspends networking in the background). Any code sequentially
 * `await`-ing such a call would freeze forever with nothing to catch. Every
 * network call the call feature makes goes through this wrapper so a stuck
 * request always fails within a bounded time instead of hanging the whole
 * call setup/signaling flow indefinitely.
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await platformFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetchWithTimeout(url, init);
    if (res.status !== 429) return res;
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(retryAfterSec, 1), 3) * 1000),
    );
  }
  return fetchWithTimeout(url, init);
}

export async function fetchIceServers(): Promise<{
  iceServers: RTCIceServer[];
  turnSource: "metered" | "static" | "fallback" | null;
}> {
  try {
    const res = await fetchWithTimeout("/api/messenger/call/ice-config");
    if (!res.ok) {
      return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }], turnSource: null };
    }
    const data = (await res.json()) as {
      iceServers: RTCIceServer[];
      turnSource?: "metered" | "static" | "fallback";
    };
    return {
      iceServers: data.iceServers?.length
        ? data.iceServers
        : [{ urls: "stun:stun.l.google.com:19302" }],
      turnSource: data.turnSource ?? null,
    };
  } catch {
    return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }], turnSource: null };
  }
}

export async function initiateCall(params: {
  channel: string;
  peerPhone: string;
}): Promise<InitiateCallResponse> {
  try {
    const res = await fetchWithTimeout("/api/messenger/call/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: params.channel, peerPhone: params.peerPhone }),
    });
    return (await res.json()) as InitiateCallResponse;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function sendCallSignal(params: {
  callId: string;
  type: CallSignalType;
  payload?: string;
}): Promise<boolean> {
  try {
    const res = await fetchWithTimeout("/api/messenger/call/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pollCallSignals(
  callId: string,
  sinceSeq: number,
): Promise<CallPollResponse | null> {
  try {
    const res = await fetchWithRetry(
      `/api/messenger/call/poll?callId=${encodeURIComponent(callId)}&since=${sinceSeq}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as CallPollResponse;
  } catch {
    return null;
  }
}

export async function pollActiveCall(channel: string): Promise<{
  active: boolean;
  incoming?: boolean;
  session?: CallPollResponse["session"];
}> {
  try {
    const res = await fetchWithRetry("/api/messenger/call/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    if (!res.ok) return { active: false };
    return (await res.json()) as {
      active: boolean;
      incoming?: boolean;
      session?: CallPollResponse["session"];
    };
  } catch {
    return { active: false };
  }
}

export async function heartbeatCall(callId: string): Promise<void> {
  try {
    await fetchWithTimeout("/api/messenger/call/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
  } catch {
    // best-effort; missed heartbeats just shorten the server-side TTL grace
  }
}

export async function pollIncomingCall(): Promise<{
  incoming: boolean;
  callId?: string;
  channel?: string;
  callerPhone?: string;
} | null> {
  try {
    const res = await fetchWithRetry("/api/messenger/call/incoming");
    if (!res.ok) return null;
    return (await res.json()) as {
      incoming: boolean;
      callId?: string;
      channel?: string;
      callerPhone?: string;
    };
  } catch {
    return null;
  }
}

export async function endCallApi(callId: string, reason?: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout("/api/messenger/call/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
