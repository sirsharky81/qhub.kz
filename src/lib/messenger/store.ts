import {
  DEFAULT_MSG_TTL_HOURS,
  DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  REDIS_AUTH_PREFIX,
  REDIS_DM_PREFIX,
  REDIS_PUBKEY_PREFIX,
  REDIS_ROOM_PREFIX,
  REDIS_WHITELIST_KEY,
  ROOM_INACTIVE_MS,
} from "./constants";
import type {
  ChannelMeta,
  EncryptedMessagePayload,
  MessengerAuthRecord,
  RoomMeta,
  RoomParticipant,
  WhitelistEntry,
} from "./types";
import {
  parseRedisJsonValue,
  redisDel,
  redisExpire,
  redisGet,
  redisGetJson,
  redisLpush,
  redisLrange,
  redisLrem,
  redisSet,
} from "./redis";

function msgTtlSec(): number {
  const hours = Number(process.env.MESSENGER_MSG_TTL_HOURS ?? DEFAULT_MSG_TTL_HOURS);
  return Math.max(1, hours) * 3600;
}

function roomInactiveTtlSec(): number {
  const hours = Number(process.env.MESSENGER_ROOM_INACTIVE_TTL_HOURS ?? DEFAULT_ROOM_INACTIVE_TTL_HOURS);
  return Math.max(1, hours) * 3600;
}

// --- Whitelist ---

export async function loadWhitelist(): Promise<Record<string, WhitelistEntry>> {
  const data = await redisGetJson<Record<string, WhitelistEntry>>(REDIS_WHITELIST_KEY);
  return data ?? {};
}

export async function saveWhitelist(data: Record<string, WhitelistEntry>): Promise<void> {
  await redisSet(REDIS_WHITELIST_KEY, JSON.stringify(data));
}

export async function getWhitelistEntry(phone: string): Promise<WhitelistEntry | null> {
  const all = await loadWhitelist();
  return all[phone] ?? null;
}

export async function isPhoneWhitelisted(phone: string): Promise<boolean> {
  const entry = await getWhitelistEntry(phone);
  return entry?.status === "active";
}

// --- Auth ---

function authKey(phone: string): string {
  return `${REDIS_AUTH_PREFIX}${phone}`;
}

export async function getAuthRecord(phone: string): Promise<MessengerAuthRecord | null> {
  return redisGetJson<MessengerAuthRecord>(authKey(phone));
}

export async function saveAuthRecord(record: MessengerAuthRecord): Promise<void> {
  await redisSet(authKey(record.phone), JSON.stringify(record));
}

export async function resetAuthPin(phone: string): Promise<void> {
  const existing = await getAuthRecord(phone);
  const record: MessengerAuthRecord = {
    phone,
    pinHash: null,
    pinSetAt: existing?.pinSetAt ?? null,
    mustChangePin: true,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await saveAuthRecord(record);
}

// --- Pubkeys (intentionally public — not secret) ---

function pubkeyKey(phone: string): string {
  return `${REDIS_PUBKEY_PREFIX}${phone}`;
}

export async function getPublicKey(phone: string): Promise<string | null> {
  const raw = await redisGet(pubkeyKey(phone));
  if (!raw) return null;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

export async function setPublicKey(phone: string, publicKeyJwk: string): Promise<void> {
  await redisSet(pubkeyKey(phone), publicKeyJwk);
}

// --- DM channels ---

function dmMetaKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:meta`;
}

function dmMessagesKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:messages`;
}

export async function getDmMeta(chatId: string): Promise<ChannelMeta | null> {
  return redisGetJson<ChannelMeta>(dmMetaKey(chatId));
}

export async function pushDmMessage(chatId: string, msg: EncryptedMessagePayload): Promise<number> {
  const ttl = msgTtlSec();
  const now = Date.now();
  const meta = (await getDmMeta(chatId)) ?? { version: 0, updatedAt: now };
  meta.version += 1;
  meta.updatedAt = now;
  await redisSet(dmMetaKey(chatId), JSON.stringify(meta), ttl);
  await redisLpush(dmMessagesKey(chatId), JSON.stringify(msg));
  await redisExpire(dmMessagesKey(chatId), ttl);
  return meta.version;
}

export async function getDmMessagesSince(
  chatId: string,
  sinceVersion: number,
): Promise<{ meta: ChannelMeta; messages: EncryptedMessagePayload[] }> {
  const meta = (await getDmMeta(chatId)) ?? { version: 0, updatedAt: Date.now() };
  if (sinceVersion >= meta.version) {
    return { meta, messages: [] };
  }
  const rawList = await redisLrange(dmMessagesKey(chatId), 0, -1);
  const messages = rawList
    .map((r) => parseRedisJsonValue<EncryptedMessagePayload>(r))
    .filter((m): m is EncryptedMessagePayload => m !== null)
    .reverse();
  return { meta, messages };
}

export async function ackDmMessage(chatId: string, messageId: string): Promise<void> {
  const rawList = await redisLrange(dmMessagesKey(chatId), 0, -1);
  for (const raw of rawList) {
    const msg = parseRedisJsonValue<EncryptedMessagePayload>(raw);
    if (msg) {
      if (msg.id === messageId) {
        await redisLrem(dmMessagesKey(chatId), 1, typeof raw === "string" ? raw : JSON.stringify(raw));
        break;
      }
    }
  }
}

// --- Rooms ---

function roomMetaKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId}:meta`;
}

function roomParticipantsKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId}:participants`;
}

function roomMessagesKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId}:messages`;
}

export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  return redisGetJson<RoomMeta>(roomMetaKey(roomId));
}

export async function getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
  return (await redisGetJson<RoomParticipant[]>(roomParticipantsKey(roomId))) ?? [];
}

async function saveRoomParticipants(roomId: string, participants: RoomParticipant[]): Promise<void> {
  const ttl = roomInactiveTtlSec();
  await redisSet(roomParticipantsKey(roomId), JSON.stringify(participants), ttl);
}

export async function createRoomMeta(roomId: string, createdBy: string): Promise<RoomMeta> {
  const ttl = roomInactiveTtlSec();
  const now = Date.now();
  const meta: RoomMeta = { version: 0, updatedAt: now, createdAt: now, createdBy };
  await redisSet(roomMetaKey(roomId), JSON.stringify(meta), ttl);
  await saveRoomParticipants(roomId, [{ phone: createdBy, lastSeen: now }]);
  return meta;
}

export async function joinRoomParticipant(roomId: string, phone: string): Promise<RoomParticipant[]> {
  const ttl = roomInactiveTtlSec();
  const now = Date.now();
  let participants = await getRoomParticipants(roomId);
  const idx = participants.findIndex((p) => p.phone === phone);
  if (idx >= 0) {
    participants[idx] = { phone, lastSeen: now };
  } else {
    participants.push({ phone, lastSeen: now });
  }
  await saveRoomParticipants(roomId, participants);
  await redisExpire(roomMetaKey(roomId), ttl);
  return participants;
}

export async function updateRoomHeartbeat(roomId: string, phone: string): Promise<void> {
  const participants = await getRoomParticipants(roomId);
  const now = Date.now();
  const updated = participants.map((p) =>
    p.phone === phone ? { ...p, lastSeen: now } : p,
  );
  await saveRoomParticipants(roomId, updated);
  await redisExpire(roomMetaKey(roomId), roomInactiveTtlSec());
}

export async function pruneStaleRoomParticipants(
  roomId: string,
  staleMs: number,
): Promise<RoomParticipant[]> {
  const now = Date.now();
  const participants = await getRoomParticipants(roomId).then((list) =>
    list.filter((p) => now - p.lastSeen <= staleMs),
  );
  if (participants.length === 0) {
    await deleteRoom(roomId);
    return [];
  }
  await saveRoomParticipants(roomId, participants);
  return participants;
}

export async function pruneInactiveRoom(roomId: string): Promise<void> {
  const meta = await getRoomMeta(roomId);
  if (!meta) return;
  if (Date.now() - meta.updatedAt > ROOM_INACTIVE_MS) {
    await deleteRoom(roomId);
  }
}

export async function leaveRoom(roomId: string, phone: string): Promise<boolean> {
  const participants = await getRoomParticipants(roomId).then((list) =>
    list.filter((p) => p.phone !== phone),
  );
  if (participants.length === 0) {
    await deleteRoom(roomId);
    return true;
  }
  await saveRoomParticipants(roomId, participants);
  return false;
}

export async function deleteRoom(roomId: string): Promise<void> {
  await redisDel(
    roomMetaKey(roomId),
    roomParticipantsKey(roomId),
    roomMessagesKey(roomId),
  );
}

export async function pushRoomMessage(roomId: string, msg: EncryptedMessagePayload): Promise<number> {
  const ttl = msgTtlSec();
  const roomTtl = roomInactiveTtlSec();
  const now = Date.now();
  const meta = (await getRoomMeta(roomId)) ?? {
    version: 0,
    updatedAt: now,
    createdAt: now,
    createdBy: msg.from,
  };
  meta.version += 1;
  meta.updatedAt = now;
  await redisSet(roomMetaKey(roomId), JSON.stringify(meta), roomTtl);
  await redisLpush(roomMessagesKey(roomId), JSON.stringify(msg));
  await redisExpire(roomMessagesKey(roomId), ttl);
  return meta.version;
}

export async function getRoomMessagesSince(
  roomId: string,
  sinceVersion: number,
): Promise<{ meta: RoomMeta | ChannelMeta; messages: EncryptedMessagePayload[]; participants: RoomParticipant[] }> {
  const meta = await getRoomMeta(roomId);
  if (!meta) {
    return {
      meta: { version: 0, updatedAt: Date.now() },
      messages: [],
      participants: [],
    };
  }
  const participants = await getRoomParticipants(roomId);
  if (sinceVersion >= meta.version) {
    return { meta, messages: [], participants };
  }
  const rawList = await redisLrange(roomMessagesKey(roomId), 0, -1);
  const messages = rawList
    .map((r) => parseRedisJsonValue<EncryptedMessagePayload>(r))
    .filter((m): m is EncryptedMessagePayload => m !== null)
    .reverse();
  return { meta, messages, participants };
}

export async function ackRoomMessage(roomId: string, messageId: string): Promise<void> {
  const rawList = await redisLrange(roomMessagesKey(roomId), 0, -1);
  for (const raw of rawList) {
    const msg = parseRedisJsonValue<EncryptedMessagePayload>(raw);
    if (msg?.id === messageId) {
      await redisLrem(roomMessagesKey(roomId), 1, typeof raw === "string" ? raw : JSON.stringify(raw));
      break;
    }
  }
}
