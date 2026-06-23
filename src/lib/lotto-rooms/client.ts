import type { LottoPlayer } from "@/lib/random-picker/lotto-tickets";
import type { LottoGameState } from "@/lib/random-picker/lotto";
import type { LottoParticipantView, LottoRoomSnapshot } from "./types";

const PARTICIPANT_SESSION_KEY = "qhub_lotto_participant";

export interface ParticipantSession {
  roomCode: string;
  playerId: string;
  joinToken: string;
  playerName: string;
}

export function saveParticipantSession(session: ParticipantSession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PARTICIPANT_SESSION_KEY, JSON.stringify(session));
}

export function loadParticipantSession(): ParticipantSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARTICIPANT_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ParticipantSession;
  } catch {
    return null;
  }
}

export function clearParticipantSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PARTICIPANT_SESSION_KEY);
}

export async function createLottoRoomApi(input: {
  players: LottoPlayer[];
  settings: LottoGameState["settings"];
  winRules: LottoGameState["winRules"];
  cardsGenerated: boolean;
}): Promise<{
  roomCode: string;
  hostSecret: string;
  players: Array<LottoPlayer & { joinCode: string; joinToken: string }>;
}> {
  const res = await fetch("/api/lotto/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось создать комнату");
  }
  return res.json() as Promise<{
    roomCode: string;
    hostSecret: string;
    players: Array<LottoPlayer & { joinCode: string; joinToken: string }>;
  }>;
}

export async function syncLottoRoomApi(
  roomCode: string,
  hostSecret: string,
  snapshot: Omit<LottoRoomSnapshot, "roomCode" | "version" | "updatedAt">,
): Promise<{ players: Array<{ id: string; joined: boolean; left: boolean }> }> {
  const res = await fetch(`/api/lotto/rooms/${encodeURIComponent(roomCode)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Lotto-Host-Secret": hostSecret,
    },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось синхронизировать комнату");
  }
  return res.json() as Promise<{ players: Array<{ id: string; joined: boolean; left: boolean }> }>;
}

export async function joinLottoRoomApi(
  roomCode: string,
  joinCode: string,
): Promise<ParticipantSession> {
  const res = await fetch(`/api/lotto/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ joinCode }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось присоединиться");
  }
  const data = (await res.json()) as ParticipantSession;
  saveParticipantSession(data);
  return data;
}

export async function joinLottoRoomByTokenApi(
  roomCode: string,
  playerId: string,
  joinToken: string,
): Promise<ParticipantSession> {
  const res = await fetch(`/api/lotto/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, joinToken }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось присоединиться");
  }
  const data = (await res.json()) as ParticipantSession;
  saveParticipantSession(data);
  return data;
}

export async function leaveLottoRoomApi(session: ParticipantSession): Promise<void> {
  await fetch(`/api/lotto/rooms/${encodeURIComponent(session.roomCode)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: session.playerId,
      joinToken: session.joinToken,
    }),
  });
  clearParticipantSession();
}

export async function pollLottoRoomApi(
  session: ParticipantSession,
  sinceVersion = 0,
): Promise<LottoParticipantView | null> {
  const params = new URLSearchParams({
    playerId: session.playerId,
    joinToken: session.joinToken,
    sinceVersion: String(sinceVersion),
  });
  const res = await fetch(
    `/api/lotto/rooms/${encodeURIComponent(session.roomCode)}?${params.toString()}`,
  );
  if (res.status === 304) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Комната недоступна");
  }
  return res.json() as Promise<LottoParticipantView>;
}

export function buildJoinUrl(
  origin: string,
  roomCode: string,
  playerId: string,
  joinToken: string,
): string {
  const params = new URLSearchParams({
    join: "1",
    room: roomCode,
    player: playerId,
    token: joinToken,
  });
  return `${origin}/tools/random-picker/loto?${params.toString()}`;
}

export function parseJoinSearchParams(search: string): {
  roomCode: string;
  playerId: string;
  joinToken: string;
} | null {
  const params = new URLSearchParams(search);
  if (params.get("join") !== "1") return null;
  const roomCode = params.get("room")?.trim();
  const playerId = params.get("player")?.trim();
  const joinToken = params.get("token")?.trim();
  if (!roomCode || !playerId || !joinToken) return null;
  return { roomCode, playerId, joinToken };
}
