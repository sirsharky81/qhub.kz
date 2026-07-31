import {
  MAX_PARTICIPANTS,
  MAX_SIGNALS,
  REDIS_CODE_PREFIX,
  REDIS_PARTICIPANT_PREFIX,
  REDIS_ROOM_PREFIX,
  REDIS_SIGNAL_SEQ_PREFIX,
  REDIS_SIGNALS_PREFIX,
  REDIS_TOKEN_PREFIX,
  ROOM_TTL_SEC,
} from "./constants";
import { generateRoomCode, normalizeInviteToken, normalizeRoomCodeInput } from "./room-codes";
import {
  shareRedisDel,
  shareRedisGetJson,
  shareRedisIncr,
  shareRedisLpush,
  shareRedisLrange,
  shareRedisSet,
} from "./redis";
import {
  generateAccessToken,
  generateInviteToken,
  generateParticipantId,
  generateUuidV7,
  hashToken,
} from "./tokens";
import type {
  ShareParticipant,
  SharePollResponse,
  ShareRoom,
  ShareRoomPublic,
  ShareSignal,
  ShareSignalType,
} from "./types";

function roomKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId}`;
}

function participantKey(participantId: string): string {
  return `${REDIS_PARTICIPANT_PREFIX}${participantId}`;
}

function tokenKey(tokenHash: string): string {
  return `${REDIS_TOKEN_PREFIX}${tokenHash}`;
}

function codeKey(code: string): string {
  return `${REDIS_CODE_PREFIX}${normalizeRoomCodeInput(code)}`;
}

function signalsKey(roomId: string): string {
  return `${REDIS_SIGNALS_PREFIX}${roomId}`;
}

function signalSeqKey(roomId: string): string {
  return `${REDIS_SIGNAL_SEQ_PREFIX}${roomId}`;
}

async function saveRoom(room: ShareRoom): Promise<void> {
  room.version += 1;
  await shareRedisSet(roomKey(room.roomId), JSON.stringify(room), ROOM_TTL_SEC);
}

async function saveParticipant(participant: ShareParticipant): Promise<void> {
  participant.lastSeen = Date.now();
  await shareRedisSet(participantKey(participant.participantId), JSON.stringify(participant), ROOM_TTL_SEC);
}

export async function getRoom(roomId: string): Promise<ShareRoom | null> {
  return shareRedisGetJson<ShareRoom>(roomKey(roomId));
}

export async function getParticipant(participantId: string): Promise<ShareParticipant | null> {
  return shareRedisGetJson<ShareParticipant>(participantKey(participantId));
}

export async function verifyParticipantToken(
  participantId: string,
  accessToken: string,
): Promise<ShareParticipant | null> {
  const participant = await getParticipant(participantId);
  if (!participant || participant.left) return null;
  if (participant.tokenHash !== hashToken(accessToken)) return null;
  return participant;
}

async function resolveRoomByInviteToken(token: string): Promise<ShareRoom | null> {
  const normalized = normalizeInviteToken(token);
  const roomId = await shareRedisGetJson<string>(tokenKey(hashToken(normalized)));
  if (!roomId) return null;
  return getRoom(roomId);
}

async function resolveRoomByCode(code: string): Promise<ShareRoom | null> {
  const normalized = normalizeRoomCodeInput(code);
  const roomId = await shareRedisGetJson<string>(codeKey(normalized));
  if (!roomId) return null;
  return getRoom(roomId);
}

export async function resolveRoomByJoinInput(input: string): Promise<ShareRoom | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const token = url.searchParams.get("t")?.trim();
      if (token) return resolveRoomByInviteToken(token);
    } catch {
      /* fall through */
    }
  }

  if (/^[a-f0-9]{32}$/i.test(trimmed)) {
    return resolveRoomByInviteToken(trimmed);
  }
  return resolveRoomByCode(trimmed);
}

async function uniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const existing = await shareRedisGetJson<string>(codeKey(code));
    if (!existing) return code;
  }
  throw new Error("code_collision");
}

export async function createShareRoom(deviceName: string): Promise<{
  room: ShareRoom;
  participant: ShareParticipant;
  accessToken: string;
  inviteToken: string;
}> {
  const roomId = generateUuidV7();
  const inviteToken = generateInviteToken();
  const roomCode = await uniqueRoomCode();
  const participantId = generateParticipantId();
  const accessToken = generateAccessToken();
  const now = Date.now();

  const room: ShareRoom = {
    roomId,
    roomCode,
    tokenHash: hashToken(inviteToken),
    createdAt: now,
    expiresAt: now + ROOM_TTL_SEC * 1000,
    hostParticipantId: participantId,
    guestParticipantId: null,
    closed: false,
    version: 0,
  };

  const participant: ShareParticipant = {
    participantId,
    roomId,
    role: "host",
    deviceName: deviceName.trim() || "Устройство",
    tokenHash: hashToken(accessToken),
    joinedAt: now,
    lastSeen: now,
    left: false,
  };

  await shareRedisSet(roomKey(roomId), JSON.stringify(room), ROOM_TTL_SEC);
  await shareRedisSet(tokenKey(room.tokenHash), JSON.stringify(roomId), ROOM_TTL_SEC);
  await shareRedisSet(codeKey(roomCode), JSON.stringify(roomId), ROOM_TTL_SEC);
  await saveParticipant(participant);

  return { room, participant, accessToken, inviteToken };
}

export async function joinShareRoom(
  joinInput: string,
  deviceName: string,
): Promise<{
  room: ShareRoom;
  participant: ShareParticipant;
  accessToken: string;
}> {
  const room = await resolveRoomByJoinInput(joinInput);
  if (!room || room.closed) throw new Error("room_not_found");
  if (Date.now() > room.expiresAt) throw new Error("room_expired");
  if (room.guestParticipantId) throw new Error("room_full");

  const participantId = generateParticipantId();
  const accessToken = generateAccessToken();
  const now = Date.now();

  const participant: ShareParticipant = {
    participantId,
    roomId: room.roomId,
    role: "guest",
    deviceName: deviceName.trim() || "Устройство",
    tokenHash: hashToken(accessToken),
    joinedAt: now,
    lastSeen: now,
    left: false,
  };

  room.guestParticipantId = participantId;
  await saveRoom(room);
  await saveParticipant(participant);

  return { room, participant, accessToken };
}

async function deleteRoomMappings(room: ShareRoom): Promise<void> {
  await shareRedisDel(
    tokenKey(room.tokenHash),
    codeKey(room.roomCode),
    signalsKey(room.roomId),
    signalSeqKey(room.roomId),
  );
}

export async function closeShareRoom(participantId: string): Promise<void> {
  const participant = await getParticipant(participantId);
  if (!participant) return;

  participant.left = true;
  await saveParticipant(participant);

  const room = await getRoom(participant.roomId);
  if (!room) return;

  const host = await getParticipant(room.hostParticipantId);
  const guest = room.guestParticipantId ? await getParticipant(room.guestParticipantId) : null;

  const hostLeft = !host || host.left;
  const guestLeft = !guest || guest.left;

  if (hostLeft && guestLeft) {
    room.closed = true;
    await shareRedisDel(roomKey(room.roomId));
    await deleteRoomMappings(room);
    if (host) await shareRedisDel(participantKey(host.participantId));
    if (guest) await shareRedisDel(participantKey(guest.participantId));
  }
}

export async function appendShareSignal(input: {
  roomId: string;
  fromParticipantId: string;
  type: ShareSignalType;
  payload?: string;
}): Promise<ShareSignal | null> {
  const room = await getRoom(input.roomId);
  if (!room || room.closed) return null;

  if (
    input.fromParticipantId !== room.hostParticipantId &&
    input.fromParticipantId !== room.guestParticipantId
  ) {
    return null;
  }

  const seq = await shareRedisIncr(signalSeqKey(input.roomId));
  const signal: ShareSignal = {
    seq,
    fromParticipantId: input.fromParticipantId,
    type: input.type,
    payload: input.payload,
    createdAt: Date.now(),
  };

  await shareRedisLpush(signalsKey(input.roomId), JSON.stringify(signal));
  await shareRedisSet(signalSeqKey(input.roomId), String(seq), ROOM_TTL_SEC);
  return signal;
}

export async function getShareSignals(roomId: string, afterSeq: number): Promise<ShareSignal[]> {
  const rawItems = await shareRedisLrange(signalsKey(roomId), 0, MAX_SIGNALS - 1);
  const signals: ShareSignal[] = [];
  for (const raw of rawItems) {
    try {
      const parsed = JSON.parse(raw) as ShareSignal;
      if (parsed.seq > afterSeq) signals.push(parsed);
    } catch {
      /* skip */
    }
  }
  return signals.sort((a, b) => a.seq - b.seq);
}

export async function buildRoomPublic(room: ShareRoom): Promise<ShareRoomPublic> {
  const host = await getParticipant(room.hostParticipantId);
  const guest = room.guestParticipantId ? await getParticipant(room.guestParticipantId) : null;
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    hostDeviceName: host?.deviceName ?? "Хост",
    guestDeviceName: guest?.deviceName ?? null,
    full: Boolean(room.guestParticipantId),
    closed: room.closed,
    expiresAt: room.expiresAt,
    version: room.version,
  };
}

export async function buildPollSnapshot(
  participantId: string,
  afterSeq: number,
): Promise<SharePollResponse | null> {
  const participant = await getParticipant(participantId);
  if (!participant || participant.left) return null;

  const room = await getRoom(participant.roomId);
  if (!room || room.closed) return null;

  participant.lastSeen = Date.now();
  await saveParticipant(participant);

  const peerId =
    participant.role === "host" ? room.guestParticipantId : room.hostParticipantId;
  const peer = peerId ? await getParticipant(peerId) : null;

  const signals = await getShareSignals(room.roomId, afterSeq);
  const latestSeq = signals.length ? signals[signals.length - 1]!.seq : afterSeq;

  return {
    room: await buildRoomPublic(room),
    peer: peer && !peer.left
      ? { participantId: peer.participantId, deviceName: peer.deviceName, role: peer.role }
      : null,
    signals,
    latestSeq,
  };
}

export async function touchParticipant(participantId: string): Promise<void> {
  const participant = await getParticipant(participantId);
  if (!participant) return;
  await saveParticipant(participant);
}
