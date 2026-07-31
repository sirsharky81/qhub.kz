import { createShareRoomEngine, type RoomCoreEngine } from "@/lib/room-core";
import {
  MAX_SIGNALS,
  REDIS_SIGNAL_SEQ_PREFIX,
  REDIS_SIGNALS_PREFIX,
  ROOM_TTL_SEC,
} from "./constants";
import { shareRedisIncr, shareRedisLpush, shareRedisLrange, shareRedisSet } from "./redis";
import { publishShareSignal } from "./publish";
import type {
  ShareParticipant,
  SharePollResponse,
  ShareRoom,
  ShareRoomPublic,
  ShareSignal,
  ShareSignalType,
} from "./types";

let engine: RoomCoreEngine | null = null;

function getEngine(): RoomCoreEngine {
  engine ??= createShareRoomEngine();
  return engine;
}

function signalsKey(roomId: string): string {
  return `${REDIS_SIGNALS_PREFIX}${roomId}`;
}

function signalSeqKey(roomId: string): string {
  return `${REDIS_SIGNAL_SEQ_PREFIX}${roomId}`;
}

function toShareParticipant(member: {
  memberId: string;
  roomId: string;
  displayName: string;
  role: string;
  tokenHash: string;
  joinedAt: number;
  lastSeen: number;
  left: boolean;
}): ShareParticipant {
  return {
    participantId: member.memberId,
    roomId: member.roomId,
    role: member.role as ShareParticipant["role"],
    deviceName: member.displayName,
    tokenHash: member.tokenHash,
    joinedAt: member.joinedAt,
    lastSeen: member.lastSeen,
    left: member.left,
  };
}

function toShareRoom(room: {
  roomId: string;
  roomCode: string;
  inviteTokenHash: string;
  createdAt: number;
  expiresAt: number;
  ownerMemberId: string;
  memberIds: string[];
  closed: boolean;
  version: number;
  pinHash?: string | null;
}): ShareRoom {
  const guestId = room.memberIds.find((id) => id !== room.ownerMemberId) ?? null;
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    tokenHash: room.inviteTokenHash,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    hostParticipantId: room.ownerMemberId,
    guestParticipantId: guestId,
    closed: room.closed,
    version: room.version,
    pinHash: room.pinHash ?? null,
  };
}

export async function getRoom(roomId: string): Promise<ShareRoom | null> {
  const room = await getEngine().getRoom(roomId);
  return room ? toShareRoom(room) : null;
}

export async function getParticipant(participantId: string): Promise<ShareParticipant | null> {
  const member = await getEngine().getMember(participantId);
  return member ? toShareParticipant(member) : null;
}

export async function verifyParticipantToken(
  participantId: string,
  accessToken: string,
): Promise<ShareParticipant | null> {
  const member = await getEngine().verifyMember(participantId, accessToken);
  return member ? toShareParticipant(member) : null;
}

export async function resolveRoomByJoinInput(input: string): Promise<ShareRoom | null> {
  const room = await getEngine().resolveRoomByJoinInput(input);
  return room ? toShareRoom(room) : null;
}

export async function createShareRoom(deviceName: string, pin?: string | null): Promise<{
  room: ShareRoom;
  participant: ShareParticipant;
  accessToken: string;
  inviteToken: string;
}> {
  const result = await getEngine().createRoom(deviceName, pin);
  return {
    room: toShareRoom(result.room),
    participant: toShareParticipant(result.member),
    accessToken: result.accessToken,
    inviteToken: result.inviteToken,
  };
}

export async function joinShareRoom(joinInput: string, deviceName: string, pin?: string | null): Promise<{
  room: ShareRoom;
  participant: ShareParticipant;
  accessToken: string;
}> {
  const result = await getEngine().joinRoom(joinInput, deviceName, pin);
  return {
    room: toShareRoom(result.room),
    participant: toShareParticipant(result.member),
    accessToken: result.accessToken,
  };
}

export async function closeShareRoom(participantId: string): Promise<void> {
  await getEngine().leaveRoom(participantId);
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
  await publishShareSignal(input.roomId, signal);
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
    full: Boolean(room.guestParticipantId && guest && !guest.left),
    closed: room.closed,
    expiresAt: room.expiresAt,
    version: room.version,
    hasPin: Boolean(room.pinHash),
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
  await getEngine().touchMember(participantId);

  const peerId =
    participant.role === "host" ? room.guestParticipantId : room.hostParticipantId;
  const peer = peerId ? await getParticipant(peerId) : null;

  const signals = await getShareSignals(room.roomId, afterSeq);
  const latestSeq = signals.length ? signals[signals.length - 1]!.seq : afterSeq;

  const snapshot: SharePollResponse = {
    room: await buildRoomPublic(room),
    peer: peer && !peer.left
      ? { participantId: peer.participantId, deviceName: peer.deviceName, role: peer.role }
      : null,
    signals,
    latestSeq,
  };

  return snapshot;
}

export async function touchParticipant(participantId: string): Promise<void> {
  await getEngine().touchMember(participantId);
}

/** Test-only reset */
export function resetShareRoomEngineForTests(): void {
  engine = null;
}
