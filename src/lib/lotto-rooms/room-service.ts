import {
  DEFAULT_LOTTO_SETTINGS,
  type LottoSettings,
  type LottoWinRules,
} from "@/lib/random-picker/lotto";
import {
  DEFAULT_LOTTO_WIN_RULES,
  LOTTO_MAX_PLAYERS,
} from "@/lib/random-picker/lotto-tickets";
import type { LottoPlayer } from "@/lib/random-picker/lotto-tickets";
import { generateRoomCode, generateSecret } from "./codes";
import { getRoom, saveRoom, deleteRoom } from "./store";
import type { LottoRoomPlayer, LottoRoomRecord, LottoRoomSnapshot } from "./types";

export function toPublicSnapshot(room: LottoRoomRecord): LottoRoomSnapshot {
  const { hostSecret: _, ...snapshot } = room;
  return snapshot;
}

export function stripJoinTokens(room: LottoRoomSnapshot) {
  return {
    ...room,
    players: room.players.map(({ joinToken: _, ...p }) => p),
  };
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function ensureUniquePlayerName(desiredName: string, existingPlayers: LottoRoomPlayer[]): string {
  const fallback = desiredName.trim() || "Игрок";
  const occupied = new Set(
    existingPlayers.filter((p) => !p.left).map((p) => normalizeName(p.name)),
  );
  if (!occupied.has(normalizeName(fallback))) return fallback;

  const defaultMatch = /^игрок\s*(\d+)$/i.exec(fallback.trim());
  if (defaultMatch) {
    let idx = Math.max(2, Number(defaultMatch[1] ?? 2));
    while (occupied.has(normalizeName(`Игрок ${idx}`))) idx += 1;
    return `Игрок ${idx}`;
  }

  let suffix = 2;
  while (occupied.has(normalizeName(`${fallback} (${suffix})`))) suffix += 1;
  return `${fallback} (${suffix})`;
}

function playersToRoomPlayers(players: LottoPlayer[]): LottoRoomPlayer[] {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    ticket: p.ticket,
    wins: p.wins ?? [],
    joinToken: generateSecret(16),
    joined: false,
    left: false,
  }));
}

export async function createLottoRoom(input: {
  hostName: string;
  settings?: LottoSettings;
  winRules?: LottoWinRules;
}): Promise<LottoRoomRecord> {
  let roomCode = generateRoomCode();
  for (let i = 0; i < 10; i++) {
    const existing = await getRoom(roomCode);
    if (!existing) break;
    roomCode = generateRoomCode();
  }

  const now = Date.now();
  const hostId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `host-${Date.now()}`;
  const room: LottoRoomRecord = {
    roomCode,
    hostSecret: generateSecret(24),
    status: "idle",
    settings: { ...DEFAULT_LOTTO_SETTINGS, ...input.settings },
    winRules: { ...DEFAULT_LOTTO_WIN_RULES, ...input.winRules },
    drawn: [],
    remaining: [],
    current: null,
    countdownSec: input.settings?.intervalSec ?? DEFAULT_LOTTO_SETTINGS.intervalSec,
    cardsGenerated: false,
    activeWinAlert: null,
    players: playersToRoomPlayers([
      {
        id: hostId,
        name: input.hostName.trim() || "Игрок 1",
        ticket: null,
        wins: [],
      },
    ]).map((p, idx) => (idx === 0 ? { ...p, joined: true } : p)),
    version: 1,
    updatedAt: now,
    createdAt: now,
  };

  await saveRoom(room);
  return room;
}

export async function deleteLottoRoom(
  code: string,
  hostSecret: string,
): Promise<boolean> {
  const room = await getRoom(code);
  if (!room || room.hostSecret !== hostSecret) return false;
  await deleteRoom(code);
  return true;
}

export async function updateLottoRoom(
  code: string,
  hostSecret: string,
  patch: Partial<LottoRoomSnapshot> & { players?: LottoRoomPlayer[] },
): Promise<LottoRoomRecord | null> {
  const room = await getRoom(code);
  if (!room || room.hostSecret !== hostSecret) return null;

  const next: LottoRoomRecord = {
    ...room,
    ...patch,
    roomCode: room.roomCode,
    hostSecret: room.hostSecret,
    createdAt: room.createdAt,
    version: room.version + 1,
    updatedAt: Date.now(),
  };

  if (patch.players) {
    if (patch.players.length > LOTTO_MAX_PLAYERS) return null;
    const prevById = new Map(room.players.map((p) => [p.id, p]));
    next.players = patch.players.map((p) => {
      const prev = prevById.get(p.id);
      if (!prev) return p as LottoRoomPlayer;
      return {
        ...p,
        joinToken: prev.joinToken,
        joined: prev.joined,
        left: prev.left,
      };
    });
  }

  await saveRoom(next);
  return next;
}

export function findPlayerByCredentials(
  room: LottoRoomRecord,
  playerId: string,
  joinToken: string,
): LottoRoomPlayer | undefined {
  return room.players.find((p) => p.id === playerId && p.joinToken === joinToken);
}

export function createRoomPlayer(name: string, existingPlayers: LottoRoomPlayer[]): LottoRoomPlayer {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `player-${Date.now()}`;
  return {
    id,
    name: ensureUniquePlayerName(name, existingPlayers),
    ticket: null,
    wins: [],
    joinToken: generateSecret(16),
    joined: true,
    left: false,
  };
}
