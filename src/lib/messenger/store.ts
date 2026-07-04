import {
  DEFAULT_MSG_TTL_HOURS,
  DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  REDIS_AUTH_PREFIX,
  REDIS_DM_PREFIX,
  REDIS_DM_USER_INDEX_PREFIX,
  REDIS_PUBKEY_PREFIX,
  REDIS_PROFILES_KEY,
  REDIS_ROOM_PREFIX,
  REDIS_WHITELIST_KEY,
  ROOM_INACTIVE_MS,
} from "./constants";
import type {
  ChannelEnvelope,
  ChannelMeta,
  EncryptedMessagePayload,
  MessageType,
  MessengerAuthRecord,
  MessengerProfile,
  ReceiptPayload,
  RoomMeta,
  RoomParticipant,
  WhitelistEntry,
  DmDialogSummary,
} from "./types";
import {
  parseRedisJsonValue,
  redisDel,
  redisExpire,
  redisIncr,
  redisGet,
  redisGetJson,
  redisLpush,
  redisLrange,
  redisLrem,
  redisSet,
} from "./redis";
import { normalizeKzPhone, peerFromDmChannel } from "./phone";

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

// --- Profiles ---

export async function loadProfiles(): Promise<Record<string, MessengerProfile>> {
  const data = await redisGetJson<Record<string, MessengerProfile>>(REDIS_PROFILES_KEY);
  return data ?? {};
}

export async function getProfile(phone: string): Promise<MessengerProfile | null> {
  const all = await loadProfiles();
  return all[phone] ?? null;
}

export async function saveProfile(profile: MessengerProfile): Promise<void> {
  const all = await loadProfiles();
  all[profile.phone] = profile;
  await redisSet(REDIS_PROFILES_KEY, JSON.stringify(all));
}

export function displayNameForPhone(
  phone: string,
  profiles: Record<string, MessengerProfile>,
): string {
  const name = profiles[phone]?.displayName?.trim();
  return name || phone;
}

// --- Envelope helpers ---

export function parseChannelEnvelope(raw: unknown): ChannelEnvelope | null {
  const parsed = parseRedisJsonValue<ChannelEnvelope>(raw);
  if (!parsed) return null;
  if ("kind" in parsed && parsed.kind === "receipt") return parsed as ReceiptPayload;
  if ("ciphertext" in parsed && "iv" in parsed) {
    return { ...parsed, kind: "message" } as EncryptedMessagePayload & { kind: "message" };
  }
  return null;
}

function isReceipt(envelope: ChannelEnvelope): envelope is ReceiptPayload {
  return "kind" in envelope && envelope.kind === "receipt";
}

async function pushEnvelope(
  messagesKey: string,
  metaKey: string,
  envelope: ChannelEnvelope,
  getMeta: () => Promise<ChannelMeta | RoomMeta | null>,
  metaTtl: number,
  msgTtl: number,
): Promise<number> {
  const now = Date.now();
  const versionCounterKey = `${metaKey}:version`;
  const nextVersion = await redisIncr(versionCounterKey);
  const existing = await getMeta();
  const meta = existing ?? { version: 0, updatedAt: now };
  meta.version = Math.max(meta.version + 1, nextVersion);
  meta.updatedAt = now;
  await redisSet(metaKey, JSON.stringify(meta), metaTtl);
  await redisExpire(versionCounterKey, metaTtl);
  await redisLpush(messagesKey, JSON.stringify(envelope));
  await redisExpire(messagesKey, msgTtl);
  return meta.version;
}

async function getEnvelopesSince(
  messagesKey: string,
  getMeta: () => Promise<ChannelMeta | RoomMeta | null>,
  sinceVersion: number,
): Promise<{ meta: ChannelMeta; envelopes: ChannelEnvelope[] }> {
  const meta = (await getMeta()) ?? { version: 0, updatedAt: Date.now() };
  if (sinceVersion >= meta.version) {
    return { meta, envelopes: [] };
  }
  const rawList = await redisLrange(messagesKey, 0, -1);
  const envelopes = rawList
    .map((r) => parseChannelEnvelope(r))
    .filter((m): m is ChannelEnvelope => m !== null)
    .reverse();
  return { meta, envelopes };
}

async function ackEnvelope(messagesKey: string, messageId: string): Promise<void> {
  const rawList = await redisLrange(messagesKey, 0, -1);
  for (const raw of rawList) {
    const envelope = parseChannelEnvelope(raw);
    if (envelope && envelope.id === messageId) {
      await redisLrem(messagesKey, 1, typeof raw === "string" ? raw : JSON.stringify(raw));
      break;
    }
  }
}

// --- DM channels ---

function dmMetaKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:meta`;
}

function dmMessagesKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:messages`;
}

function dmUserIndexKey(phone: string): string {
  return `${REDIS_DM_USER_INDEX_PREFIX}${normalizeKzPhone(phone)}`;
}

type DmUserIndexEntry = {
  chatId: string;
  peerPhone: string;
  lastMessageAt: number;
  lastMessageType?: MessageType | null;
  lastMessageFromMe?: boolean;
  unreadCount?: number;
  latestUnreadAt?: number | null;
};

async function loadDmUserIndex(phone: string): Promise<Record<string, DmUserIndexEntry>> {
  return (await redisGetJson<Record<string, DmUserIndexEntry>>(dmUserIndexKey(phone))) ?? {};
}

async function saveDmUserIndex(phone: string, index: Record<string, DmUserIndexEntry>): Promise<void> {
  await redisSet(dmUserIndexKey(phone), JSON.stringify(index), msgTtlSec());
}

export async function getDmMeta(chatId: string): Promise<ChannelMeta | null> {
  return redisGetJson<ChannelMeta>(dmMetaKey(chatId));
}

export async function pushDmMessage(chatId: string, msg: EncryptedMessagePayload): Promise<number> {
  return pushDmEnvelope(chatId, { ...msg, kind: "message" });
}

export async function pushDmEnvelope(chatId: string, envelope: ChannelEnvelope): Promise<number> {
  return pushEnvelope(
    dmMessagesKey(chatId),
    dmMetaKey(chatId),
    envelope,
    () => getDmMeta(chatId),
    msgTtlSec(),
    msgTtlSec(),
  );
}

export async function touchDmUserIndex(chatId: string, at = Date.now()): Promise<void> {
  const parts = chatId.split(":");
  if (parts.length !== 3 || parts[0] !== "dm") return;
  const a = normalizeKzPhone(parts[1] ?? "");
  const b = normalizeKzPhone(parts[2] ?? "");
  if (!a || !b) return;

  const updateOne = async (me: string, peer: string) => {
    const existing = await loadDmUserIndex(me);
    const prev = existing[chatId];
    existing[chatId] = {
      chatId,
      peerPhone: peer,
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, at),
      lastMessageType: prev?.lastMessageType ?? null,
      lastMessageFromMe: prev?.lastMessageFromMe ?? false,
      unreadCount: Math.max(0, prev?.unreadCount ?? 0),
      latestUnreadAt: prev?.latestUnreadAt ?? null,
    };
    await saveDmUserIndex(me, existing);
  };

  await Promise.all([updateOne(a, b), updateOne(b, a)]);
}

export async function applyDmUnreadOnMessage(params: {
  chatId: string;
  senderPhone: string;
  type: MessageType;
  ts: number;
  recipientViewingThisChat: boolean;
}): Promise<void> {
  const { chatId, senderPhone, type, ts, recipientViewingThisChat } = params;
  const parts = chatId.split(":");
  if (parts.length !== 3 || parts[0] !== "dm") return;
  const a = normalizeKzPhone(parts[1] ?? "");
  const b = normalizeKzPhone(parts[2] ?? "");
  if (!a || !b) return;

  const sender = normalizeKzPhone(senderPhone);
  const recipient = sender === a ? b : a;
  const senderPeer = sender === a ? b : a;
  const recipientPeer = sender;

  const updateOne = async (
    me: string,
    peer: string,
    incrementUnread: boolean,
    lastMessageFromMe: boolean,
  ) => {
    const existing = await loadDmUserIndex(me);
    const prev = existing[chatId];
    const nextUnread = Math.max(0, (prev?.unreadCount ?? 0) + (incrementUnread ? 1 : 0));
    existing[chatId] = {
      chatId,
      peerPhone: peer,
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, ts),
      lastMessageType: type,
      lastMessageFromMe,
      unreadCount: nextUnread,
      latestUnreadAt: incrementUnread
        ? Math.max(prev?.latestUnreadAt ?? 0, ts)
        : (prev?.latestUnreadAt ?? null),
    };
    await saveDmUserIndex(me, existing);
  };

  await Promise.all([
    updateOne(sender, senderPeer, false, true),
    updateOne(recipient, recipientPeer, !recipientViewingThisChat, false),
  ]);
}

export async function markDmDialogRead(phone: string, chatId: string): Promise<void> {
  const me = normalizeKzPhone(phone);
  const existing = await loadDmUserIndex(me);
  const entry = existing[chatId];
  if (!entry) return;
  existing[chatId] = {
    ...entry,
    unreadCount: 0,
    latestUnreadAt: null,
  };
  await saveDmUserIndex(me, existing);
}

export async function getDmDialogSummariesForUser(phone: string): Promise<DmDialogSummary[]> {
  const me = normalizeKzPhone(phone);
  const index = await loadDmUserIndex(me);
  const result: DmDialogSummary[] = [];
  let touchedIndex = false;

  for (const [chatId, entry] of Object.entries(index)) {
    const channel = entry.chatId;
    const peer = entry.peerPhone ? normalizeKzPhone(entry.peerPhone) : peerFromDmChannel(channel, me);
    if (!peer) continue;

    let lastMessageAt = entry.lastMessageAt ?? 0;
    let lastMessageType = entry.lastMessageType ?? null;
    let lastMessageFromMe = Boolean(entry.lastMessageFromMe);
    let unreadCount = entry.unreadCount;
    let latestUnreadAt = entry.latestUnreadAt;

    const needsBackfill =
      unreadCount === undefined ||
      latestUnreadAt === undefined ||
      entry.lastMessageType === undefined ||
      entry.lastMessageFromMe === undefined;

    if (needsBackfill) {
      const rawList = await redisLrange(dmMessagesKey(chatId), 0, -1);
      let computedUnread = 0;
      let computedLatestUnreadAt: number | null = null;
      let computedLastAt = lastMessageAt;
      let computedLastType: MessageType | null = lastMessageType;
      let computedLastFromMe = lastMessageFromMe;

      for (const raw of rawList) {
        const envelope = parseChannelEnvelope(raw);
        if (!envelope || isReceipt(envelope)) continue;
        if (envelope.ts >= computedLastAt) {
          computedLastAt = envelope.ts;
          computedLastType = envelope.type;
          computedLastFromMe = normalizeKzPhone(envelope.from) === me;
        }
        if (normalizeKzPhone(envelope.from) !== me) {
          computedUnread += 1;
          computedLatestUnreadAt = Math.max(computedLatestUnreadAt ?? 0, envelope.ts ?? 0);
        }
      }

      lastMessageAt = computedLastAt;
      lastMessageType = computedLastType;
      lastMessageFromMe = computedLastFromMe;
      unreadCount = computedUnread;
      latestUnreadAt = computedLatestUnreadAt;

      index[chatId] = {
        chatId,
        peerPhone: peer,
        lastMessageAt,
        lastMessageType,
        lastMessageFromMe,
        unreadCount,
        latestUnreadAt,
      };
      touchedIndex = true;
    }

    result.push({
      chatId: channel,
      peerPhone: peer,
      lastMessageAt,
      lastMessageType,
      lastMessageFromMe,
      latestUnreadAt: latestUnreadAt ?? null,
      unreadCount: Math.max(0, unreadCount ?? 0),
    });
  }

  if (touchedIndex) {
    await saveDmUserIndex(me, index);
  }

  result.sort((a, b) => {
    const aPriority = a.latestUnreadAt ?? a.lastMessageAt;
    const bPriority = b.latestUnreadAt ?? b.lastMessageAt;
    return bPriority - aPriority;
  });
  return result;
}

export async function getDmMessagesSince(
  chatId: string,
  sinceVersion: number,
): Promise<{ meta: ChannelMeta; messages: EncryptedMessagePayload[]; envelopes: ChannelEnvelope[] }> {
  const { meta, envelopes } = await getEnvelopesSince(
    dmMessagesKey(chatId),
    () => getDmMeta(chatId),
    sinceVersion,
  );
  const messages = envelopes.filter((e): e is EncryptedMessagePayload => !isReceipt(e));
  return { meta, messages, envelopes };
}

export async function ackDmMessage(chatId: string, messageId: string): Promise<void> {
  await ackEnvelope(dmMessagesKey(chatId), messageId);
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
  return pushRoomEnvelope(roomId, { ...msg, kind: "message" });
}

export async function pushRoomEnvelope(roomId: string, envelope: ChannelEnvelope): Promise<number> {
  return pushEnvelope(
    roomMessagesKey(roomId),
    roomMetaKey(roomId),
    envelope,
    () => getRoomMeta(roomId),
    roomInactiveTtlSec(),
    msgTtlSec(),
  );
}

export async function getRoomMessagesSince(
  roomId: string,
  sinceVersion: number,
): Promise<{
  meta: RoomMeta | ChannelMeta;
  messages: EncryptedMessagePayload[];
  envelopes: ChannelEnvelope[];
  participants: RoomParticipant[];
}> {
  const meta = await getRoomMeta(roomId);
  if (!meta) {
    return {
      meta: { version: 0, updatedAt: Date.now() },
      messages: [],
      envelopes: [],
      participants: [],
    };
  }
  const participants = await getRoomParticipants(roomId);
  const { meta: channelMeta, envelopes } = await getEnvelopesSince(
    roomMessagesKey(roomId),
    () => getRoomMeta(roomId),
    sinceVersion,
  );
  const messages = envelopes.filter((e): e is EncryptedMessagePayload => !isReceipt(e));
  return { meta: channelMeta, messages, envelopes, participants };
}

export async function ackRoomMessage(roomId: string, messageId: string): Promise<void> {
  await ackEnvelope(roomMessagesKey(roomId), messageId);
}
