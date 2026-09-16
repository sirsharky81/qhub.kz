import { GameEngine } from "@/lib/games/core/engine";
import { applyClockTimeout, finishByReason } from "../clock";
import { createChessDefinition, createInitialChessState } from "../rules";
import type { ChessColor, ChessColorPref, ChessState, ChessTimeControl } from "../types";
import { oppositeColor } from "../types";
import { deleteChessRoom, getChessRoom, saveChessRoom } from "./store";
import type {
  ChessDispatchPayload,
  ChessRoomJoinResult,
  ChessRoomPublic,
  ChessRoomRecord,
  ChessRoomSeat,
} from "./types";

const MAX_PLAYERS = 2;
const DISCONNECT_FORFEIT_MS = 60_000;

function randomToken(size = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out.push(alphabet[b % alphabet.length]!);
  return out.join("");
}

function createRoomCode(): string {
  return randomToken(6);
}

function createSeat(name: string, now: number, color: ChessColor | null = null): ChessRoomSeat {
  return {
    id: `p_${randomToken(10).toLowerCase()}`,
    name,
    color,
    joinToken: randomToken(24),
    connected: true,
    lastSeenAt: now,
  };
}

function toPublicRoom(room: ChessRoomRecord): ChessRoomPublic {
  return {
    roomCode: room.roomCode,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    hostColorPref: room.hostColorPref,
    timeControl: room.timeControl,
    seats: room.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      color: seat.color,
      connected: seat.connected,
      lastSeenAt: seat.lastSeenAt,
    })),
    state: room.state,
    version: room.version,
    updatedAt: room.updatedAt,
  };
}

function roomJoinResult(
  room: ChessRoomRecord,
  playerId: string,
  joinToken: string,
  includeHostSecret: boolean,
): ChessRoomJoinResult {
  return {
    roomCode: room.roomCode,
    playerId,
    joinToken,
    hostSecret: includeHostSecret ? room.hostSecret : undefined,
    room: toPublicRoom(room),
  };
}

function assignHostColor(pref: ChessColorPref): ChessColor {
  if (pref === "random") return Math.random() < 0.5 ? "w" : "b";
  return pref;
}

function startGame(room: ChessRoomRecord, now: number): ChessRoomRecord {
  const host = room.seats.find((seat) => seat.id === room.hostPlayerId);
  const guest = room.seats.find((seat) => seat.id !== room.hostPlayerId);
  if (!host || !guest) return room;
  const hostColor = assignHostColor(room.hostColorPref);
  const guestColor = oppositeColor(hostColor);
  const seats = room.seats.map((seat) =>
    seat.id === host.id ? { ...seat, color: hostColor } : { ...seat, color: guestColor },
  );
  const definition = createChessDefinition({
    gameId: `room-${room.roomCode}`,
    timeControl: room.timeControl,
    now,
    players: [
      { id: host.id, name: host.name, color: hostColor, isBot: false },
      { id: guest.id, name: guest.name, color: guestColor, isBot: false },
    ],
  });
  const engine = new GameEngine(definition);
  return {
    ...room,
    seats,
    state: engine.getState(),
    status: "playing",
    version: room.version + 1,
    updatedAt: now,
  };
}

function createWaitingState(host: ChessRoomSeat, timeControl: ChessTimeControl, now: number): ChessState {
  return createInitialChessState({
    gameId: `room-wait-${now}`,
    timeControl,
    now,
    phase: "waiting",
    players: [{ id: host.id, name: host.name, color: "w", isBot: false }],
  });
}

async function applyServerClocks(room: ChessRoomRecord, now: number): Promise<ChessRoomRecord> {
  if (room.status !== "playing" || room.state.phase !== "playing") return room;
  let nextState = applyClockTimeout(room.state, now);
  if (nextState.phase === "finished") {
    const next = {
      ...room,
      state: nextState,
      status: "finished" as const,
      version: room.version + 1,
      updatedAt: now,
    };
    await saveChessRoom(next);
    return next;
  }

  const disconnected = room.seats.find((seat) => !seat.connected && now - seat.lastSeenAt >= DISCONNECT_FORFEIT_MS);
  if (disconnected?.color) {
    const winner = room.seats.find((seat) => seat.id !== disconnected.id);
    nextState = finishByReason(nextState, now, {
      reason: "disconnect",
      winnerId: winner?.id ?? null,
      winnerColor: winner?.color ?? null,
    });
    const next = {
      ...room,
      state: nextState,
      status: "finished" as const,
      version: room.version + 1,
      updatedAt: now,
    };
    await saveChessRoom(next);
    return next;
  }
  return room;
}

export async function createRoom(input: {
  playerName: string;
  colorPref?: ChessColorPref;
  timeControl: ChessTimeControl;
}): Promise<ChessRoomJoinResult> {
  const now = Date.now();
  const host = createSeat(input.playerName.trim() || "Игрок", now);
  const room: ChessRoomRecord = {
    roomCode: createRoomCode(),
    hostSecret: randomToken(24),
    hostPlayerId: host.id,
    hostColorPref: input.colorPref ?? "random",
    timeControl: input.timeControl,
    status: "open",
    seats: [host],
    state: createWaitingState(host, input.timeControl, now),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await saveChessRoom(room);
  return roomJoinResult(room, host.id, host.joinToken, true);
}

export async function joinRoomByCode(roomCode: string, playerName: string): Promise<ChessRoomJoinResult> {
  const room = await getChessRoom(roomCode);
  if (!room) throw new Error("Комната не найдена");
  if (room.status !== "open") throw new Error("Комната уже запущена");
  if (room.seats.length >= MAX_PLAYERS) throw new Error("Комната заполнена");
  const now = Date.now();
  const seat = createSeat(playerName.trim() || "Игрок", now);
  const withGuest: ChessRoomRecord = {
    ...room,
    seats: [...room.seats, seat],
    version: room.version + 1,
    updatedAt: now,
  };
  const started = startGame(withGuest, now);
  await saveChessRoom(started);
  return roomJoinResult(started, seat.id, seat.joinToken, false);
}

export async function getRoomPublic(code: string): Promise<ChessRoomPublic | null> {
  const room = await getChessRoom(code);
  if (!room) return null;
  const next = await applyServerClocks(room, Date.now());
  return toPublicRoom(next);
}

export async function dispatchAction(code: string, payload: ChessDispatchPayload): Promise<ChessRoomPublic> {
  let room = await getChessRoom(code);
  if (!room) throw new Error("Комната не найдена");
  room = await applyServerClocks(room, Date.now());
  const seat = room.seats.find((item) => item.id === payload.playerId && item.joinToken === payload.joinToken);
  if (!seat) throw new Error("Неверные учетные данные игрока");
  if (room.status !== "playing") throw new Error("Игра ещё не началась");
  const definition = createChessDefinition({
    gameId: room.state.gameId,
    timeControl: room.timeControl,
    players: room.state.players,
  });
  const engine = new GameEngine(definition);
  engine.replaceState(room.state);
  const now = Date.now();
  const result = engine.dispatch(payload.action, { actorId: payload.playerId, at: now });
  if (!result.valid) throw new Error(result.reason ?? "Недопустимое действие");
  const next: ChessRoomRecord = {
    ...room,
    state: result.state,
    status: result.state.phase === "finished" ? "finished" : "playing",
    version: room.version + 1,
    updatedAt: now,
    seats: room.seats.map((item) =>
      item.id === seat.id ? { ...item, connected: true, lastSeenAt: now } : item,
    ),
  };
  await saveChessRoom(next);
  return toPublicRoom(next);
}

export async function setConnectionState(
  code: string,
  playerId: string,
  joinToken: string,
  connected: boolean,
): Promise<ChessRoomPublic | null> {
  let room = await getChessRoom(code);
  if (!room) throw new Error("Комната не найдена");
  room = await applyServerClocks(room, Date.now());
  const idx = room.seats.findIndex((seat) => seat.id === playerId && seat.joinToken === joinToken);
  if (idx === -1) throw new Error("Неверные учетные данные игрока");
  const now = Date.now();
  const seats = [...room.seats];
  seats[idx] = {
    ...seats[idx]!,
    connected,
    lastSeenAt: now,
  };
  const connectedHumans = seats.filter((seat) => seat.connected);
  if (connectedHumans.length === 0) {
    await deleteChessRoom(code);
    return null;
  }
  const hostStillConnected = seats.some((seat) => seat.id === room.hostPlayerId && seat.connected);
  const next: ChessRoomRecord = {
    ...room,
    seats,
    hostPlayerId: hostStillConnected ? room.hostPlayerId : connectedHumans[0]!.id,
    version: room.version + 1,
    updatedAt: now,
  };
  const timed = await applyServerClocks(next, now);
  await saveChessRoom(timed);
  return toPublicRoom(timed);
}

export async function closeRoom(code: string, playerId: string, joinToken: string): Promise<boolean> {
  const room = await getChessRoom(code);
  if (!room) return false;
  const seat = room.seats.find((item) => item.id === playerId && item.joinToken === joinToken);
  if (!seat || seat.id !== room.hostPlayerId) return false;
  await deleteChessRoom(code);
  return true;
}
