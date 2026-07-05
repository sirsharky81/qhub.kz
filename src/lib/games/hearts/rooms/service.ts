import { GameEngine } from "@/lib/games/core/engine";
import { createHeartsDefinition } from "../rules";
import type { HeartsAiLevel, HeartsPlayerSeed, HeartsState } from "../types";
import {
  deleteHeartsRoom,
  getHeartsRoom,
  listHeartsRooms,
  saveHeartsRoom,
} from "./store";
import type {
  HeartsDispatchPayload,
  HeartsInactivityState,
  HeartsRoomJoinResult,
  HeartsRoomPublic,
  HeartsRoomRecord,
  HeartsRoomSeat,
} from "./types";

const MAX_PLAYERS = 4;
const HUMAN_INACTIVITY_SEC = 180;

function randomToken(size = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    out.push(alphabet[b % alphabet.length]!);
  }
  return out.join("");
}

function createRoomCode(): string {
  return randomToken(6);
}

function createSeat(input: {
  name: string;
  isBot: boolean;
  aiLevel?: HeartsAiLevel;
}): HeartsRoomSeat {
  return {
    id: `p_${randomToken(10).toLowerCase()}`,
    name: input.name,
    isBot: input.isBot,
    aiLevel: input.aiLevel ?? "medium",
    joinToken: input.isBot ? null : randomToken(24),
    connected: !input.isBot,
    controlledByAi: input.isBot,
  };
}

function toSeed(seat: HeartsRoomSeat): HeartsPlayerSeed {
  return {
    id: seat.id,
    name: seat.name,
    isBot: seat.isBot,
    aiLevel: seat.aiLevel,
  };
}

function toPublicRoom(room: HeartsRoomRecord): HeartsRoomPublic {
  return {
    roomCode: room.roomCode,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      isBot: seat.isBot,
      aiLevel: seat.aiLevel,
      connected: seat.connected,
      controlledByAi: seat.controlledByAi,
    })),
    state: room.state,
    version: room.version,
    updatedAt: room.updatedAt,
    inactivity: room.inactivity,
  };
}

function hasHumanVsHumanSeats(seats: readonly HeartsRoomSeat[]): boolean {
  return seats.filter((seat) => !seat.isBot && !seat.controlledByAi).length >= 2;
}

function createInactivityState(input: {
  enabled: boolean;
  activePlayerId: string | null;
  now: number;
  excludedPlayerIds?: string[];
}): HeartsInactivityState {
  return {
    enabled: input.enabled,
    activePlayerId: input.enabled ? input.activePlayerId : null,
    deadlineAt:
      input.enabled && input.activePlayerId ? input.now + HUMAN_INACTIVITY_SEC * 1000 : null,
    excludedPlayerIds: input.excludedPlayerIds ?? [],
  };
}

function syncInactivity(room: HeartsRoomRecord, now: number, reset: boolean): HeartsInactivityState {
  if (room.status !== "playing" || room.state.phase !== "playing" || !hasHumanVsHumanSeats(room.seats)) {
    return createInactivityState({
      enabled: false,
      activePlayerId: null,
      now,
      excludedPlayerIds: room.inactivity?.excludedPlayerIds ?? [],
    });
  }
  const activeSeat = room.seats.find((seat) => seat.id === room.state.currentTurnId);
  if (!activeSeat || activeSeat.isBot || activeSeat.controlledByAi) {
    return {
      ...room.inactivity,
      enabled: true,
      activePlayerId: null,
      deadlineAt: null,
      excludedPlayerIds: room.inactivity?.excludedPlayerIds ?? [],
    };
  }
  if (
    !reset &&
    room.inactivity?.enabled &&
    room.inactivity.activePlayerId === activeSeat.id &&
    room.inactivity.deadlineAt
  ) {
    return room.inactivity;
  }
  return createInactivityState({
    enabled: true,
    activePlayerId: activeSeat.id,
    now,
    excludedPlayerIds: room.inactivity?.excludedPlayerIds ?? [],
  });
}

function startRoomWithBots(room: HeartsRoomRecord): HeartsRoomRecord {
  const seats = [...room.seats];
  while (seats.length < MAX_PLAYERS) {
    seats.push(
      createSeat({
        name: `Игрок ${seats.length + 1}`,
        isBot: true,
        aiLevel: seats.length > 2 ? "hard" : "medium",
      }),
    );
  }
  const definition = createHeartsDefinition({
    gameId: `room-${room.roomCode}`,
    players: seats.map(toSeed),
  });
  const engine = new GameEngine(definition);
  const now = Date.now();
  const next: HeartsRoomRecord = {
    ...room,
    seats,
    state: engine.getState(),
    status: "playing",
    version: room.version + 1,
    updatedAt: now,
    inactivity: room.inactivity,
  };
  next.inactivity = syncInactivity(next, now, true);
  return next;
}

function createOpenRoom(hostName: string): HeartsRoomRecord {
  const now = Date.now();
  const hostSeat = createSeat({ name: hostName, isBot: false });
  const definition = createHeartsDefinition({
    gameId: `room-${createRoomCode()}`,
    players: [
      toSeed(hostSeat),
      { id: "temp_1", name: "Игрок 2", isBot: true, aiLevel: "easy" },
      { id: "temp_2", name: "Игрок 3", isBot: true, aiLevel: "easy" },
      { id: "temp_3", name: "Игрок 4", isBot: true, aiLevel: "easy" },
    ],
  });
  return {
    roomCode: createRoomCode(),
    hostSecret: randomToken(24),
    hostPlayerId: hostSeat.id,
    status: "open",
    seats: [hostSeat],
    state: definition.initialState(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    inactivity: createInactivityState({
      enabled: false,
      activePlayerId: null,
      now,
    }),
  };
}

function joinOpenRoom(room: HeartsRoomRecord, playerName: string): HeartsRoomRecord {
  if (room.status !== "open") {
    throw new Error("Комната уже запущена");
  }
  if (room.seats.length >= MAX_PLAYERS) {
    throw new Error("Комната заполнена");
  }
  const seat = createSeat({ name: playerName, isBot: false });
  return {
    ...room,
    seats: [...room.seats, seat],
    version: room.version + 1,
    updatedAt: Date.now(),
  };
}

function roomJoinResult(
  room: HeartsRoomRecord,
  playerId: string,
  joinToken: string,
  includeHostSecret: boolean,
): HeartsRoomJoinResult {
  return {
    roomCode: room.roomCode,
    playerId,
    joinToken,
    hostSecret: includeHostSecret ? room.hostSecret : undefined,
    room: toPublicRoom(room),
  };
}

export async function quickMatch(playerName: string): Promise<HeartsRoomJoinResult> {
  const rooms = await listHeartsRooms();
  const open = rooms.find((room) => room.status === "open" && room.seats.length < MAX_PLAYERS);
  if (open) {
    const joined = joinOpenRoom(open, playerName);
    const started = startRoomWithBots(joined);
    await saveHeartsRoom(started);
    const seat = started.seats.find((item) => item.name === playerName && !item.isBot);
    if (!seat?.joinToken) throw new Error("Failed to create join credentials");
    return roomJoinResult(started, seat.id, seat.joinToken, false);
  }
  const created = createOpenRoom(playerName);
  const started = startRoomWithBots(created);
  await saveHeartsRoom(started);
  const host = started.seats.find((seat) => seat.name === playerName && !seat.isBot);
  if (!host?.joinToken) throw new Error("Failed to create host credentials");
  return roomJoinResult(started, host.id, host.joinToken, true);
}

export async function createRoom(playerName: string): Promise<HeartsRoomJoinResult> {
  const room = createOpenRoom(playerName);
  await saveHeartsRoom(room);
  const host = room.seats[0]!;
  if (!host.joinToken) throw new Error("Failed to create host credentials");
  return roomJoinResult(room, host.id, host.joinToken, true);
}

export async function joinRoomByCode(
  roomCode: string,
  playerName: string,
): Promise<HeartsRoomJoinResult> {
  const room = await getHeartsRoom(roomCode);
  if (!room) throw new Error("Комната не найдена");
  const joined = joinOpenRoom(room, playerName);
  const started = startRoomWithBots(joined);
  await saveHeartsRoom(started);
  const seat = started.seats.find((item) => item.name === playerName && !item.isBot);
  if (!seat?.joinToken) throw new Error("Failed to create join credentials");
  return roomJoinResult(started, seat.id, seat.joinToken, false);
}

export async function getRoomPublic(code: string): Promise<HeartsRoomPublic | null> {
  let room = await getHeartsRoom(code);
  if (!room) return null;
  room = await applyInactivityIfNeeded(room);
  return toPublicRoom(room);
}

function aiProgress(state: HeartsState, seats: readonly HeartsRoomSeat[]): HeartsState {
  const definition = createHeartsDefinition({
    gameId: state.gameId,
    players: seats.map(toSeed),
  });
  const engine = new GameEngine(definition);
  engine.replaceState(state);
  let guard = 0;
  while (guard < 16) {
    const currentSeat = seats.find((seat) => seat.id === engine.getState().currentTurnId);
    if (!currentSeat?.controlledByAi) break;
    const legal = definition.getLegalActions(engine.getState(), currentSeat.id);
    const chosen = legal[0];
    if (!chosen) break;
    engine.dispatch(chosen, { actorId: currentSeat.id, at: Date.now() });
    guard += 1;
  }
  return engine.getState();
}

async function applyInactivityIfNeeded(room: HeartsRoomRecord): Promise<HeartsRoomRecord> {
  const now = Date.now();
  let next = { ...room, inactivity: syncInactivity(room, now, false) };
  if (
    !next.inactivity.enabled ||
    !next.inactivity.activePlayerId ||
    !next.inactivity.deadlineAt ||
    next.inactivity.deadlineAt > now
  ) {
    return next;
  }

  const seatIdx = next.seats.findIndex((seat) => seat.id === next.inactivity.activePlayerId);
  if (seatIdx === -1) {
    next.inactivity = syncInactivity(next, now, true);
    await saveHeartsRoom(next);
    return next;
  }

  const seats = [...next.seats];
  const expiredSeat = seats[seatIdx]!;
  if (!expiredSeat.isBot && !expiredSeat.controlledByAi) {
    seats[seatIdx] = {
      ...expiredSeat,
      connected: false,
      controlledByAi: true,
    };
  }

  const stateAfterAi = aiProgress(next.state, seats);
  const excluded = new Set(next.inactivity.excludedPlayerIds);
  excluded.add(expiredSeat.id);
  next = {
    ...next,
    seats,
    state: stateAfterAi,
    status: stateAfterAi.phase === "game_end" ? "finished" : next.status,
    version: next.version + 1,
    updatedAt: now,
    inactivity: {
      ...next.inactivity,
      excludedPlayerIds: [...excluded],
    },
  };
  next.inactivity = syncInactivity(next, now, true);
  await saveHeartsRoom(next);
  return next;
}

export async function dispatchAction(
  code: string,
  payload: HeartsDispatchPayload,
): Promise<HeartsRoomPublic> {
  let room = await getHeartsRoom(code);
  if (!room) throw new Error("Комната не найдена");
  room = await applyInactivityIfNeeded(room);
  const seat = room.seats.find(
    (item) => item.id === payload.playerId && item.joinToken === payload.joinToken,
  );
  if (!seat) throw new Error("Неверные учетные данные игрока");
  const definition = createHeartsDefinition({
    gameId: room.state.gameId,
    players: room.seats.map(toSeed),
  });
  const engine = new GameEngine(definition);
  engine.replaceState(room.state);
  const result = engine.dispatch(payload.action, { actorId: payload.playerId, at: Date.now() });
  if (!result.valid) {
    throw new Error(result.reason ?? "Недопустимое действие");
  }
  let nextState = engine.getState();
  nextState = aiProgress(nextState, room.seats);
  const now = Date.now();
  let nextRoom: HeartsRoomRecord = {
    ...room,
    state: nextState,
    status: nextState.phase === "game_end" ? "finished" : room.status,
    version: room.version + 1,
    updatedAt: now,
    inactivity: room.inactivity,
  };
  nextRoom.inactivity = syncInactivity(nextRoom, now, true);
  nextRoom = await applyInactivityIfNeeded(nextRoom);
  await saveHeartsRoom(nextRoom);
  return toPublicRoom(nextRoom);
}

export async function setConnectionState(
  code: string,
  playerId: string,
  joinToken: string,
  connected: boolean,
): Promise<HeartsRoomPublic | null> {
  let room = await getHeartsRoom(code);
  if (!room) throw new Error("Комната не найдена");
  room = await applyInactivityIfNeeded(room);
  const idx = room.seats.findIndex(
    (seat) => seat.id === playerId && seat.joinToken === joinToken && !seat.isBot,
  );
  if (idx === -1) throw new Error("Неверные учетные данные игрока");
  const seats = [...room.seats];
  seats[idx] = {
    ...seats[idx]!,
    connected,
    controlledByAi: !connected,
  };
  const connectedHumans = seats.filter((seat) => !seat.isBot && seat.connected);
  if (connectedHumans.length === 0) {
    await deleteHeartsRoom(code);
    return null;
  }
  const hostStillConnected = room.hostPlayerId
    ? seats.some((seat) => seat.id === room.hostPlayerId && !seat.isBot && seat.connected)
    : false;
  const nextHostPlayerId = hostStillConnected
    ? room.hostPlayerId
    : connectedHumans[0]?.id ?? null;
  const now = Date.now();
  const next: HeartsRoomRecord = {
    ...room,
    seats,
    hostPlayerId: nextHostPlayerId,
    version: room.version + 1,
    updatedAt: now,
    inactivity: syncInactivity({ ...room, seats }, now, true),
  };
  await saveHeartsRoom(next);
  return toPublicRoom(next);
}

export async function closeRoom(code: string, playerId: string, joinToken: string): Promise<boolean> {
  const room = await getHeartsRoom(code);
  if (!room) return false;
  const seat = room.seats.find((item) => item.id === playerId && item.joinToken === joinToken && !item.isBot);
  if (!seat || seat.id !== room.hostPlayerId) return false;
  await deleteHeartsRoom(code);
  return true;
}
