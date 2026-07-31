import { platformFetch } from "@/lib/platform/api-client";
import type { SharePollResponse, ShareSession } from "./types";

function authHeaders(session: ShareSession): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Share-Participant-Id": session.participantId,
    "X-Share-Access-Token": session.accessToken,
  };
}

export async function createShareRoomApi(deviceName: string): Promise<ShareSession> {
  const res = await platformFetch("/api/share/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось создать комнату");
  }
  const data = (await res.json()) as {
    roomId: string;
    participantId: string;
    accessToken: string;
    role: ShareSession["role"];
    deviceName: string;
    roomCode: string;
    inviteToken: string;
  };
  return {
    roomId: data.roomId,
    participantId: data.participantId,
    accessToken: data.accessToken,
    role: data.role,
    deviceName: data.deviceName,
    roomCode: data.roomCode,
    inviteToken: data.inviteToken,
  };
}

export async function joinShareRoomApi(joinInput: string, deviceName: string): Promise<ShareSession> {
  const res = await platformFetch("/api/share/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ joinInput, deviceName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const msg =
      data.error === "room_full"
        ? "Комната уже заполнена"
        : data.error === "room_expired"
          ? "Комната истекла"
          : data.error === "room_not_found"
            ? "Комната не найдена"
            : (data.error ?? "Не удалось подключиться");
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    roomId: string;
    participantId: string;
    accessToken: string;
    role: ShareSession["role"];
    deviceName: string;
    roomCode: string;
  };
  return {
    roomId: data.roomId,
    participantId: data.participantId,
    accessToken: data.accessToken,
    role: data.role,
    deviceName: data.deviceName,
    roomCode: data.roomCode,
    inviteToken: "",
  };
}

export async function closeShareRoomApi(session: ShareSession): Promise<void> {
  await platformFetch("/api/share/close", {
    method: "POST",
    headers: authHeaders(session),
  });
}

export async function sendShareSignalApi(
  session: ShareSession,
  type: "offer" | "answer" | "ice",
  payload?: string,
): Promise<void> {
  const res = await platformFetch("/api/share/signal", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Ошибка сигналинга");
  }
}

export async function pollShareRoomApi(session: ShareSession, afterSeq: number): Promise<SharePollResponse> {
  const params = new URLSearchParams({ afterSeq: String(afterSeq) });
  const res = await platformFetch(`/api/share/poll?${params}`, {
    headers: {
      "X-Share-Participant-Id": session.participantId,
      "X-Share-Access-Token": session.accessToken,
    },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Ошибка опроса");
  }
  return res.json() as Promise<SharePollResponse>;
}

export async function fetchShareIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await platformFetch("/api/share/ice-config");
    if (!res.ok) return [{ urls: "stun:stun.l.google.com:19302" }];
    const data = (await res.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers?.length ? data.iceServers : [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
