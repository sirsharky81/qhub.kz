import {
  DEFAULT_LOTTO_SETTINGS,
  type LottoSettings,
  type LottoWinRules,
} from "@/lib/random-picker/lotto";
import {
  DEFAULT_LOTTO_WIN_RULES,
  LOTTO_MAX_PLAYERS,
  type LottoPlayer,
} from "@/lib/random-picker/lotto-tickets";
import { generateJoinCode, generateRoomCode, generateSecret } from "./codes";
import { getRoom, saveRoom } from "./store";
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

function playersToRoomPlayers(players: LottoPlayer[]): LottoRoomPlayer[] {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    ticket: p.ticket,
    wins: p.wins ?? [],
    joinToken: generateSecret(16),
    joinCode: generateJoinCode(8),
    joined: false,
    left: false,
  }));
}

export async function createLottoRoom(input: {
  players: LottoPlayer[];
  settings?: LottoSettings;
  winRules?: LottoWinRules;
  cardsGenerated: boolean;
}): Promise<LottoRoomRecord> {
  if (input.players.length > LOTTO_MAX_PLAYERS) {
    throw new Error(`Максимум ${LOTTO_MAX_PLAYERS} участников`);
  }

  let roomCode = generateRoomCode();
  for (let i = 0; i < 10; i++) {
    const existing = await getRoom(roomCode);
    if (!existing) break;
    roomCode = generateRoomCode();
  }

  const now = Date.now();
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
    cardsGenerated: input.cardsGenerated,
    activeWinAlert: null,
    players: playersToRoomPlayers(input.players),
    version: 1,
    updatedAt: now,
    createdAt: now,
  };

  await saveRoom(room);
  return room;
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
        joinCode: prev.joinCode,
        joined: prev.joined,
        left: prev.left,
      };
    });
  }

  await saveRoom(next);
  return next;
}

export function findPlayerByJoinCode(
  room: LottoRoomRecord,
  joinCode: string,
): LottoRoomPlayer | undefined {
  const normalized = joinCode.toUpperCase();
  return room.players.find((p) => p.joinCode.toUpperCase() === normalized);
}

export function findPlayerByCredentials(
  room: LottoRoomRecord,
  playerId: string,
  joinToken: string,
): LottoRoomPlayer | undefined {
  return room.players.find((p) => p.id === playerId && p.joinToken === joinToken);
}
