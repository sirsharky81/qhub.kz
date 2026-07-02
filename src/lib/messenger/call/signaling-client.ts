import { platformFetch } from "@/lib/platform/api-client";
import type { CallPollResponse, InitiateCallResponse } from "./types";
import type { CallSignalType } from "../types";

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await platformFetch(url, init);
    if (res.status !== 429) return res;
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(retryAfterSec, 1), 3) * 1000),
    );
  }
  return platformFetch(url, init);
}

export async function fetchIceServers(): Promise<{
  iceServers: RTCIceServer[];
  turnSource: "metered" | "static" | "fallback" | null;
}> {
  const res = await platformFetch("/api/messenger/call/ice-config");
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
}

export async function initiateCall(params: {
  channel: string;
  peerPhone: string;
}): Promise<InitiateCallResponse> {
  const res = await platformFetch("/api/messenger/call/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: params.channel, peerPhone: params.peerPhone }),
  });
  return res.json() as Promise<InitiateCallResponse>;
}

export async function sendCallSignal(params: {
  callId: string;
  type: CallSignalType;
  payload?: string;
}): Promise<boolean> {
  const res = await platformFetch("/api/messenger/call/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.ok;
}

export async function pollCallSignals(
  callId: string,
  sinceSeq: number,
): Promise<CallPollResponse | null> {
  const res = await fetchWithRetry(
    `/api/messenger/call/poll?callId=${encodeURIComponent(callId)}&since=${sinceSeq}`,
  );
  if (!res.ok) return null;
  return res.json() as Promise<CallPollResponse>;
}

export async function pollActiveCall(channel: string): Promise<{
  active: boolean;
  incoming?: boolean;
  session?: CallPollResponse["session"];
}> {
  const res = await fetchWithRetry("/api/messenger/call/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) return { active: false };
  return res.json() as Promise<{
    active: boolean;
    incoming?: boolean;
    session?: CallPollResponse["session"];
  }>;
}

export async function heartbeatCall(callId: string): Promise<void> {
  await platformFetch("/api/messenger/call/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });
}

export async function pollIncomingCall(): Promise<{
  incoming: boolean;
  callId?: string;
  channel?: string;
  callerPhone?: string;
} | null> {
  const res = await fetchWithRetry("/api/messenger/call/incoming");
  if (!res.ok) return null;
  return res.json() as Promise<{
    incoming: boolean;
    callId?: string;
    channel?: string;
    callerPhone?: string;
  }>;
}

export async function endCallApi(callId: string, reason?: string): Promise<boolean> {
  const res = await platformFetch("/api/messenger/call/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, reason }),
  });
  return res.ok;
}
