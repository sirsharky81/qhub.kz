import type { AssistRoomState, AssistSignal } from "./store";
import type { AssistService, AssistStatusCode } from "./status";

export interface AssistSession {
  roomId: string;
  memberId: string;
  accessToken: string;
  role: "master" | "client";
  roomCode: string;
}

export interface AssistPollSnapshot {
  roomCode: string;
  closed: boolean;
  members: Array<{ memberId: string; displayName: string; role: string }>;
  state: AssistRoomState;
  signals: AssistSignal[];
  latestSeq: number;
}

function headers(session: AssistSession): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Subaru-Assist-Member-Id": session.memberId,
    "X-Subaru-Assist-Access-Token": session.accessToken,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || "Ошибка комнаты";
  } catch {
    return "Ошибка комнаты";
  }
}

export async function createAssistRoom(): Promise<AssistSession> {
  const res = await fetch("/api/subaru-assist/room", { method: "POST" });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as AssistSession;
  return body;
}

export async function joinAssistRoom(roomCode: string): Promise<AssistSession> {
  const res = await fetch("/api/subaru-assist/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AssistSession;
}

export async function pollAssistRoom(session: AssistSession, since: number): Promise<AssistPollSnapshot> {
  const res = await fetch(`/api/subaru-assist/poll?since=${since}`, { headers: headers(session) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AssistPollSnapshot;
}

export async function sendAssistSignal(
  session: AssistSession,
  type: "offer" | "answer" | "ice",
  payload: string,
): Promise<void> {
  const res = await fetch("/api/subaru-assist/signal", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function patchAssistClient(
  session: AssistSession,
  patch: { service?: AssistService; ignition?: boolean; adapter?: "offline" | "online" },
): Promise<AssistRoomState> {
  const res = await fetch("/api/subaru-assist/state", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { state: AssistRoomState };
  return body.state;
}

export async function pushAssistStatusApi(
  session: AssistSession,
  code: AssistStatusCode,
): Promise<void> {
  const res = await fetch("/api/subaru-assist/state", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify({ status: code }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function markAssistRegionReady(session: AssistSession): Promise<void> {
  const res = await fetch("/api/subaru-assist/state", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify({ regionWriteOk: true }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchAssistIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch("/api/share/ice-config");
  if (!res.ok) return [{ urls: "stun:stun.l.google.com:19302" }];
  const body = (await res.json()) as { iceServers?: RTCIceServer[] };
  return body.iceServers?.length ? body.iceServers : [{ urls: "stun:stun.l.google.com:19302" }];
}
