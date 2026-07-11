import {
  DEFAULT_MSG_TTL_HOURS,
  DEFAULT_MAX_DM_ENVELOPES,
  DEFAULT_MAX_ROOM_ENVELOPES,
  DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  DEFAULT_ROOM_USER_INDEX_TTL_SEC,
  MAX_ROOM_NAME_LENGTH,
  MESSENGER_DIALOG_PREFS_TTL_SEC,
  MESSENGER_MAX_PINNED_DIALOGS,
  REDIS_AUTH_PREFIX,
  REDIS_AVATAR_ROOM_PREFIX,
  REDIS_AVATAR_USER_PREFIX,
  REDIS_DIALOG_PREFS_PREFIX,
  REDIS_DM_PREFIX,
  REDIS_DM_USER_INDEX_PREFIX,
  REDIS_ROOM_USER_INDEX_PREFIX,
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
  redisLtrim,
  redisSet,
} from "./redis";
import { canonicalDmChatId, deriveDmChatId, normalizeKzPhone, peerFromDmChannel } from "./phone";
import { publishEnvelopesEvent } from "./realtime/publish";
import { roomAvatarUrl, userAvatarUrl } from "./display";

const WHITELIST_CACHE_TTL_MS = 30_000;
let whitelistCache: { at: number; data: Record<string, WhitelistEntry> } | null = null;

function msgTtlSec(): number {
  const hours = Number(process.env.MESSENGER_MSG_TTL_HOURS ?? DEFAULT_MSG_TTL_HOURS);
  return Math.max(1, hours) * 3600;
}

function roomInactiveTtlSec(): number {
  const hours = Number(process.env.MESSENGER_ROOM_INACTIVE_TTL_HOURS ?? DEFAULT_ROOM_INACTIVE_TTL_HOURS);
  return Math.max(1, hours) * 3600;
}

function roomUserIndexTtlSec(): number {
  const ttl = Number(process.env.MESSENGER_ROOM_USER_INDEX_TTL_SEC ?? DEFAULT_ROOM_USER_INDEX_TTL_SEC);
  return Math.max(roomInactiveTtlSec(), Math.floor(ttl));
}

function maxDmEnvelopes(): number {
  const n = Number(process.env.MESSENGER_MAX_DM_ENVELOPES ?? DEFAULT_MAX_DM_ENVELOPES);
  return Math.max(100, Math.floor(n));
}

function maxRoomEnvelopes(): number {
  const n = Number(process.env.MESSENGER_MAX_ROOM_ENVELOPES ?? DEFAULT_MAX_ROOM_ENVELOPES);
  return Math.max(200, Math.floor(n));
}

// --- Whitelist ---

export async function loadWhitelist(): Promise<Record<string, WhitelistEntry>> {
  if (whitelistCache && Date.now() - whitelistCache.at < WHITELIST_CACHE_TTL_MS) {
    return whitelistCache.data;
  }
  const data = await redisGetJson<Record<string, WhitelistEntry>>(REDIS_WHITELIST_KEY);
  const next = data ?? {};
  whitelistCache = { at: Date.now(), data: next };
  return next;
}

export async function saveWhitelist(data: Record<string, WhitelistEntry>): Promise<void> {
  await redisSet(REDIS_WHITELIST_KEY, JSON.stringify(data));
  whitelistCache = { at: Date.now(), data };
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

export type AvatarBlob = {
  mime: string;
  data: string;
  updatedAt: number;
};

function userAvatarKey(phone: string): string {
  return `${REDIS_AVATAR_USER_PREFIX}${normalizeKzPhone(phone)}`;
}

function roomAvatarStorageKey(roomId: string): string {
  return `${REDIS_AVATAR_ROOM_PREFIX}${roomId.toUpperCase()}`;
}

export async function getUserAvatarBlob(phone: string): Promise<AvatarBlob | null> {
  return redisGetJson<AvatarBlob>(userAvatarKey(phone));
}

export async function setUserAvatarBlob(
  phone: string,
  mime: string,
  data: string,
): Promise<{ avatarUrl: string; updatedAt: number }> {
  const updatedAt = Date.now();
  const blob: AvatarBlob = { mime, data, updatedAt };
  await redisSet(userAvatarKey(phone), JSON.stringify(blob));
  const avatarUrl = userAvatarUrl(phone, updatedAt);
  const prev = await getProfile(phone);
  await saveProfile({
    phone: normalizeKzPhone(phone),
    displayName: prev?.displayName ?? null,
    allowRoomAutoAdd: prev?.allowRoomAutoAdd ?? true,
    avatarUrl,
    updatedAt,
  });
  return { avatarUrl, updatedAt };
}

export async function deleteUserAvatar(phone: string): Promise<void> {
  await redisDel(userAvatarKey(phone));
  const prev = await getProfile(phone);
  if (!prev) return;
  await saveProfile({
    ...prev,
    avatarUrl: null,
    updatedAt: Date.now(),
  });
}

export async function getRoomAvatarBlob(roomId: string): Promise<AvatarBlob | null> {
  return redisGetJson<AvatarBlob>(roomAvatarStorageKey(roomId));
}

export async function setRoomAvatarBlob(
  roomId: string,
  mime: string,
  data: string,
): Promise<{ avatarUrl: string; updatedAt: number }> {
  const key = roomId.toUpperCase();
  const updatedAt = Date.now();
  const blob: AvatarBlob = { mime, data, updatedAt };
  await redisSet(roomAvatarStorageKey(key), JSON.stringify(blob));
  const avatarUrl = roomAvatarUrl(key, updatedAt);
  const meta = await getRoomMeta(key);
  if (meta) {
    await saveRoomMeta(key, { ...meta, avatarUrl, updatedAt });
  }
  return { avatarUrl, updatedAt };
}

export async function deleteRoomAvatar(roomId: string): Promise<void> {
  const key = roomId.toUpperCase();
  await redisDel(roomAvatarStorageKey(key));
  const meta = await getRoomMeta(key);
  if (!meta) return;
  await saveRoomMeta(key, { ...meta, avatarUrl: null, updatedAt: Date.now() });
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
  maxEnvelopes: number,
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
  await redisLtrim(messagesKey, 0, Math.max(0, maxEnvelopes - 1));
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
  pinnedAt?: number | null;
  pinOrder?: number | null;
  archivedAt?: number | null;
};

type UserDialogPrefs = { pinnedAt: number | null; pinOrder: number | null; archivedAt: number | null };
type UserDialogPrefsIndex = Record<string, UserDialogPrefs>;

async function loadDmUserIndex(phone: string): Promise<Record<string, DmUserIndexEntry>> {
  return (await redisGetJson<Record<string, DmUserIndexEntry>>(dmUserIndexKey(phone))) ?? {};
}

async function saveDmUserIndex(phone: string, index: Record<string, DmUserIndexEntry>): Promise<void> {
  await redisSet(dmUserIndexKey(phone), JSON.stringify(index), msgTtlSec());
}

function dialogPrefsKey(phone: string): string {
  return `${REDIS_DIALOG_PREFS_PREFIX}${normalizeKzPhone(phone)}`;
}

export async function loadDialogPrefs(phone: string): Promise<UserDialogPrefsIndex> {
  const raw = (await redisGetJson<Record<string, Partial<UserDialogPrefs>>>(dialogPrefsKey(phone))) ?? {};
  const normalized: UserDialogPrefsIndex = {};
  for (const [dialogId, prefs] of Object.entries(raw)) {
    normalized[dialogId] = {
      pinnedAt: prefs.pinnedAt ?? null,
      pinOrder: prefs.pinOrder ?? null,
      archivedAt: prefs.archivedAt ?? null,
    };
  }
  return normalized;
}

export async function saveDialogPrefs(phone: string, index: UserDialogPrefsIndex): Promise<void> {
  await redisSet(dialogPrefsKey(phone), JSON.stringify(index), MESSENGER_DIALOG_PREFS_TTL_SEC);
}

export async function setDialogPrefs(
  phone: string,
  dialogId: string,
  patch: { pinnedAt?: number | null; pinOrder?: number | null; archivedAt?: number | null },
): Promise<UserDialogPrefs> {
  const me = normalizeKzPhone(phone);
  const existing = await loadDialogPrefs(me);
  const prev = existing[dialogId] ?? { pinnedAt: null, pinOrder: null, archivedAt: null };
  const next = {
    pinnedAt: patch.pinnedAt !== undefined ? patch.pinnedAt : prev.pinnedAt,
    pinOrder: patch.pinOrder !== undefined ? patch.pinOrder : prev.pinOrder,
    archivedAt: patch.archivedAt !== undefined ? patch.archivedAt : prev.archivedAt,
  };
  existing[dialogId] = next;
  await saveDialogPrefs(me, existing);
  return next;
}

export async function setPinnedDialogsOrder(phone: string, dialogIds: string[]): Promise<void> {
  const me = normalizeKzPhone(phone);
  const existing = await loadDialogPrefs(me);
  const now = Date.now();
  for (let i = 0; i < dialogIds.length; i += 1) {
    const dialogId = dialogIds[i];
    const prev = existing[dialogId] ?? { pinnedAt: null, pinOrder: null, archivedAt: null };
    existing[dialogId] = {
      pinnedAt: prev.pinnedAt ?? now,
      pinOrder: i + 1,
      archivedAt: prev.archivedAt ?? null,
    };
  }
  await saveDialogPrefs(me, existing);
}

export async function countPinnedDialogs(phone: string): Promise<number> {
  const prefs = await loadDialogPrefs(phone);
  let count = 0;
  for (const p of Object.values(prefs)) {
    if ((p.pinnedAt ?? 0) > 0 && (p.archivedAt ?? 0) <= 0) count += 1;
  }
  return count;
}

export function maxPinnedDialogs(): number {
  const n = Number(process.env.MESSENGER_MAX_PINNED_DIALOGS ?? MESSENGER_MAX_PINNED_DIALOGS);
  return Math.max(1, Math.floor(n));
}

export async function getDmMeta(chatId: string): Promise<ChannelMeta | null> {
  return redisGetJson<ChannelMeta>(dmMetaKey(chatId));
}

export async function pushDmMessage(chatId: string, msg: EncryptedMessagePayload): Promise<number> {
  return pushDmEnvelope(chatId, { ...msg, kind: "message" });
}

export async function pushDmEnvelope(chatId: string, envelope: ChannelEnvelope): Promise<number> {
  const version = await pushEnvelope(
    dmMessagesKey(chatId),
    dmMetaKey(chatId),
    envelope,
    () => getDmMeta(chatId),
    msgTtlSec(),
    msgTtlSec(),
    maxDmEnvelopes(),
  );
  void publishEnvelopesEvent({
    channel: chatId,
    version,
    envelopes: [envelope],
    excludePhone: "from" in envelope ? envelope.from : undefined,
  }).catch(() => {});
  return version;
}

export async function touchDmUserIndex(chatId: string, at = Date.now()): Promise<void> {
  const canonicalId = canonicalDmChatId(chatId) ?? chatId;
  const parts = canonicalId.split(":");
  if (parts.length !== 3 || parts[0] !== "dm") return;
  const a = normalizeKzPhone(parts[1] ?? "");
  const b = normalizeKzPhone(parts[2] ?? "");
  if (!a || !b) return;

  const updateOne = async (me: string, peer: string) => {
    const existing = await loadDmUserIndex(me);
    const peerNorm = normalizeKzPhone(peer);
    let prev = existing[canonicalId];
    for (const [key, entry] of Object.entries(existing)) {
      if (key === canonicalId) continue;
      if (normalizeKzPhone(entry.peerPhone) === peerNorm) {
        if (!prev || (entry.lastMessageAt ?? 0) > (prev.lastMessageAt ?? 0)) {
          prev = { ...entry, chatId: canonicalId };
        }
        delete existing[key];
      }
    }
    existing[canonicalId] = {
      chatId: canonicalId,
      peerPhone: peer,
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, at),
      lastMessageType: prev?.lastMessageType ?? null,
      lastMessageFromMe: prev?.lastMessageFromMe ?? false,
      unreadCount: Math.max(0, prev?.unreadCount ?? 0),
      latestUnreadAt: prev?.latestUnreadAt ?? null,
      pinnedAt: prev?.pinnedAt ?? null,
      pinOrder: prev?.pinOrder ?? null,
      archivedAt: prev?.archivedAt ?? null,
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
  const canonicalId = canonicalDmChatId(params.chatId) ?? params.chatId;
  const { senderPhone, type, ts, recipientViewingThisChat } = params;
  const parts = canonicalId.split(":");
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
    const peerNorm = normalizeKzPhone(peer);
    let prev = existing[canonicalId];
    for (const [key, entry] of Object.entries(existing)) {
      if (key === canonicalId) continue;
      if (normalizeKzPhone(entry.peerPhone) === peerNorm) {
        if (!prev || (entry.unreadCount ?? 0) > (prev.unreadCount ?? 0)) {
          prev = { ...entry, chatId: canonicalId };
        }
        delete existing[key];
      }
    }
    const nextUnread = Math.max(0, (prev?.unreadCount ?? 0) + (incrementUnread ? 1 : 0));
    existing[canonicalId] = {
      chatId: canonicalId,
      peerPhone: peer,
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, ts),
      lastMessageType: type,
      lastMessageFromMe,
      unreadCount: nextUnread,
      latestUnreadAt: incrementUnread
        ? Math.max(prev?.latestUnreadAt ?? 0, ts)
        : (prev?.latestUnreadAt ?? null),
      pinnedAt: prev?.pinnedAt ?? null,
      pinOrder: prev?.pinOrder ?? null,
      archivedAt: prev?.archivedAt ?? null,
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
  const canonicalId = canonicalDmChatId(chatId) ?? chatId;
  const existing = await loadDmUserIndex(me);
  const entry = existing[canonicalId] ?? existing[chatId];
  if (!entry) return;
  existing[canonicalId] = {
    ...entry,
    chatId: canonicalId,
    unreadCount: 0,
    latestUnreadAt: null,
    pinnedAt: entry.pinnedAt ?? null,
    pinOrder: entry.pinOrder ?? null,
    archivedAt: entry.archivedAt ?? null,
  };
  if (chatId !== canonicalId) delete existing[chatId];
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
    const pinnedAt = entry.pinnedAt ?? null;
    const pinOrder = entry.pinOrder ?? null;
    const archivedAt = entry.archivedAt ?? null;

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
        pinnedAt,
        pinOrder,
        archivedAt,
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
      pinnedAt,
      pinOrder,
      archivedAt,
    });
  }

  if (touchedIndex) {
    await saveDmUserIndex(me, index);
  }

  const deduped = dedupeDmDialogSummaries(result, me);
  if (deduped.indexChanged) {
    await saveDmUserIndex(me, deduped.index);
  }

  deduped.summaries.sort((a, b) => {
    const aPriority = a.latestUnreadAt ?? a.lastMessageAt;
    const bPriority = b.latestUnreadAt ?? b.lastMessageAt;
    return bPriority - aPriority;
  });
  return deduped.summaries;
}

function mergeDmDialogSummary(
  a: DmDialogSummary,
  b: DmDialogSummary,
  canonicalId: string,
): DmDialogSummary {
  const primary = a.lastMessageAt >= b.lastMessageAt ? a : b;
  return {
    chatId: canonicalId,
    peerPhone: primary.peerPhone,
    lastMessageAt: Math.max(a.lastMessageAt, b.lastMessageAt),
    lastMessageType: primary.lastMessageType,
    lastMessageFromMe: primary.lastMessageFromMe,
    latestUnreadAt: Math.max(a.latestUnreadAt ?? 0, b.latestUnreadAt ?? 0) || null,
    unreadCount: Math.max(a.unreadCount ?? 0, b.unreadCount ?? 0),
    pinnedAt: Math.max(a.pinnedAt ?? 0, b.pinnedAt ?? 0) || null,
    pinOrder: (a.pinOrder ?? 0) > (b.pinOrder ?? 0) ? a.pinOrder : b.pinOrder,
    archivedAt: Math.max(a.archivedAt ?? 0, b.archivedAt ?? 0) || null,
  };
}

function dedupeDmDialogSummaries(
  summaries: DmDialogSummary[],
  me: string,
): { summaries: DmDialogSummary[]; index: Record<string, DmUserIndexEntry>; indexChanged: boolean } {
  const byPeer = new Map<string, DmDialogSummary>();
  for (const entry of summaries) {
    const peer = normalizeKzPhone(entry.peerPhone);
    const canonicalId = deriveDmChatId(me, peer);
    const prev = byPeer.get(peer);
    byPeer.set(peer, prev ? mergeDmDialogSummary(prev, entry, canonicalId) : { ...entry, chatId: canonicalId });
  }

  const deduped = Array.from(byPeer.values());
  if (deduped.length === summaries.length) {
    return { summaries: deduped, index: {}, indexChanged: false };
  }

  const index: Record<string, DmUserIndexEntry> = {};
  for (const summary of deduped) {
    index[summary.chatId] = {
      chatId: summary.chatId,
      peerPhone: summary.peerPhone,
      lastMessageAt: summary.lastMessageAt,
      lastMessageType: summary.lastMessageType,
      lastMessageFromMe: summary.lastMessageFromMe,
      unreadCount: summary.unreadCount,
      latestUnreadAt: summary.latestUnreadAt,
      pinnedAt: summary.pinnedAt,
      pinOrder: summary.pinOrder,
      archivedAt: summary.archivedAt,
    };
  }
  return { summaries: deduped, index, indexChanged: true };
}

export async function hideDialogForUser(phone: string, dialogId: string): Promise<void> {
  const me = normalizeKzPhone(phone);
  const canonicalId =
    dialogId.startsWith("dm:") ? (canonicalDmChatId(dialogId) ?? dialogId) : dialogId;

  if (canonicalId.startsWith("dm:")) {
    const peer = peerFromDmChannel(canonicalId, me);
    const index = await loadDmUserIndex(me);
    let changed = false;
    if (peer) {
      const peerNorm = normalizeKzPhone(peer);
      for (const [key, entry] of Object.entries(index)) {
        if (normalizeKzPhone(entry.peerPhone) === peerNorm || key === canonicalId || key === dialogId) {
          delete index[key];
          changed = true;
        }
      }
    } else if (index[canonicalId] || index[dialogId]) {
      delete index[canonicalId];
      delete index[dialogId];
      changed = true;
    }
    if (changed) await saveDmUserIndex(me, index);
  } else if (canonicalId.startsWith("room:")) {
    await removeRoomUserIndex(me, canonicalId.slice(5).toUpperCase());
  }

  const prefs = await loadDialogPrefs(me);
  let prefsChanged = false;
  for (const key of Object.keys(prefs)) {
    if (key === canonicalId || key === dialogId) {
      delete prefs[key];
      prefsChanged = true;
    }
    if (canonicalId.startsWith("dm:")) {
      const peer = peerFromDmChannel(canonicalId, me);
      if (peer && key.startsWith("dm:") && peerFromDmChannel(key, me) === peer) {
        delete prefs[key];
        prefsChanged = true;
      }
    }
  }
  if (prefsChanged) await saveDialogPrefs(me, prefs);
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

function roomUserIndexKey(phone: string): string {
  return `${REDIS_ROOM_USER_INDEX_PREFIX}${normalizeKzPhone(phone)}`;
}

type RoomUserIndexEntry = {
  roomId: string;
  title: string;
  createdAt: number;
  unreadCount?: number;
  latestUnreadAt?: number | null;
  lastMessageAt?: number;
  lastMessageType?: MessageType | null;
  lastReadVersion?: number;
  lastReadAt?: number | null;
};

async function loadRoomUserIndex(phone: string): Promise<Record<string, RoomUserIndexEntry>> {
  return (await redisGetJson<Record<string, RoomUserIndexEntry>>(roomUserIndexKey(phone))) ?? {};
}

async function saveRoomUserIndex(phone: string, index: Record<string, RoomUserIndexEntry>): Promise<void> {
  await redisSet(roomUserIndexKey(phone), JSON.stringify(index), roomUserIndexTtlSec());
}

async function upsertRoomUserIndex(phone: string, roomId: string, createdAt = Date.now()): Promise<void> {
  const index = await loadRoomUserIndex(phone);
  const key = roomId.toUpperCase();
  const prev = index[key];
  const meta = await getRoomMeta(key);
  const title = meta?.name?.trim() || prev?.title || `Комната ${key}`;
  index[key] = {
    roomId: key,
    title,
    createdAt: prev?.createdAt ?? createdAt,
    unreadCount: Math.max(0, prev?.unreadCount ?? 0),
    latestUnreadAt: prev?.latestUnreadAt ?? null,
    lastMessageAt: prev?.lastMessageAt ?? 0,
    lastMessageType: prev?.lastMessageType ?? null,
    lastReadVersion: prev?.lastReadVersion ?? 0,
    lastReadAt: prev?.lastReadAt ?? null,
  };
  await saveRoomUserIndex(phone, index);
}

async function removeRoomUserIndex(phone: string, roomId: string): Promise<void> {
  const index = await loadRoomUserIndex(phone);
  delete index[roomId.toUpperCase()];
  await saveRoomUserIndex(phone, index);
}

export async function getRoomDialogsForUser(
  phone: string,
): Promise<
  Array<{
    id: string;
    kind: "room";
    title: string;
    roomId: string;
    createdAt: number;
    unreadCount: number;
    latestUnreadAt: number | null;
    lastMessageAt: number;
    lastMessageType: MessageType | null;
    lastReadVersion: number;
    avatarUrl: string | null;
  }>
> {
  const index = await loadRoomUserIndex(phone);
  const entries = Object.values(index);
  const metas = await Promise.all(entries.map((entry) => getRoomMeta(entry.roomId)));
  return entries
    .map((entry, i) => {
      const meta = metas[i];
      const title =
        meta?.name?.trim() ||
        entry.title ||
        `Комната ${entry.roomId}`;
      return {
        id: `room:${entry.roomId}`,
        kind: "room" as const,
        title,
        roomId: entry.roomId,
        createdAt: entry.createdAt,
        unreadCount: Math.max(0, entry.unreadCount ?? 0),
        latestUnreadAt: entry.latestUnreadAt ?? null,
        lastMessageAt: entry.lastMessageAt ?? 0,
        lastMessageType: entry.lastMessageType ?? null,
        lastReadVersion: Math.max(0, entry.lastReadVersion ?? 0),
        avatarUrl: meta?.avatarUrl ?? null,
      };
    })
    .sort((a, b) => {
      const aPriority = a.latestUnreadAt ?? a.lastMessageAt ?? a.createdAt;
      const bPriority = b.latestUnreadAt ?? b.lastMessageAt ?? b.createdAt;
      return bPriority - aPriority;
    });
}

export async function applyRoomUnreadOnMessage(params: {
  roomId: string;
  senderPhone: string;
  type: MessageType;
  ts: number;
  currentRoomVersion: number;
  participantPhones: string[];
  viewingPhones: Set<string>;
}): Promise<void> {
  const { roomId, senderPhone, type, ts, currentRoomVersion, participantPhones, viewingPhones } = params;
  const roomKey = roomId.toUpperCase();
  const sender = normalizeKzPhone(senderPhone);
  const updates = participantPhones.map(async (rawPhone) => {
    const me = normalizeKzPhone(rawPhone);
    if (!me) return;
    const index = await loadRoomUserIndex(me);
    const prev = index[roomKey];
    const isSender = me === sender;
    const incrementUnread = !isSender && !viewingPhones.has(me);
    const nextUnread = Math.max(0, (prev?.unreadCount ?? 0) + (incrementUnread ? 1 : 0));
    index[roomKey] = {
      roomId: roomKey,
      title: prev?.title || `Комната ${roomKey}`,
      createdAt: prev?.createdAt ?? ts,
      unreadCount: nextUnread,
      latestUnreadAt: incrementUnread ? Math.max(prev?.latestUnreadAt ?? 0, ts) : (prev?.latestUnreadAt ?? null),
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, ts),
      lastMessageType: type,
      lastReadVersion: isSender
        ? Math.max(prev?.lastReadVersion ?? 0, currentRoomVersion)
        : (prev?.lastReadVersion ?? 0),
      lastReadAt: isSender ? Math.max(prev?.lastReadAt ?? 0, ts) : (prev?.lastReadAt ?? null),
    };
    await saveRoomUserIndex(me, index);
  });
  await Promise.all(updates);
}

export async function markRoomDialogRead(phone: string, roomId: string): Promise<void> {
  const me = normalizeKzPhone(phone);
  const roomKey = roomId.toUpperCase();
  const index = await loadRoomUserIndex(me);
  const prev = index[roomKey];
  const meta = await getRoomMeta(roomKey);
  index[roomKey] = {
    roomId: roomKey,
    title: prev?.title || `Комната ${roomKey}`,
    createdAt: prev?.createdAt ?? Date.now(),
    unreadCount: 0,
    latestUnreadAt: null,
    lastMessageAt: prev?.lastMessageAt ?? 0,
    lastMessageType: prev?.lastMessageType ?? null,
    lastReadVersion: Math.max(prev?.lastReadVersion ?? 0, meta?.version ?? 0),
    lastReadAt: Date.now(),
  };
  await saveRoomUserIndex(me, index);
}

export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  return redisGetJson<RoomMeta>(roomMetaKey(roomId));
}

async function saveRoomMeta(roomId: string, meta: RoomMeta): Promise<void> {
  await redisSet(roomMetaKey(roomId), JSON.stringify(meta), roomInactiveTtlSec());
}

async function syncRoomTitleForParticipants(roomId: string, title: string): Promise<void> {
  const key = roomId.toUpperCase();
  const participants = await getRoomParticipants(key);
  await Promise.all(
    participants.map(async (p) => {
      const index = await loadRoomUserIndex(p.phone);
      const prev = index[key];
      if (!prev) return;
      index[key] = { ...prev, title };
      await saveRoomUserIndex(p.phone, index);
    }),
  );
}

export async function updateRoomSettings(
  roomId: string,
  input: { name?: string | null },
): Promise<RoomMeta | null> {
  const key = roomId.toUpperCase();
  const meta = await getRoomMeta(key);
  if (!meta) return null;
  const next: RoomMeta = { ...meta, updatedAt: Date.now() };
  if (input.name !== undefined) {
    const raw = (input.name ?? "").trim();
    next.name = raw.length > 0 ? raw.slice(0, MAX_ROOM_NAME_LENGTH) : null;
    const title = next.name || `Комната ${key}`;
    await syncRoomTitleForParticipants(key, title);
  }
  await saveRoomMeta(key, next);
  return next;
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
  const meta: RoomMeta = {
    version: 0,
    updatedAt: now,
    createdAt: now,
    createdBy,
    name: null,
    avatarUrl: null,
  };
  await redisSet(roomMetaKey(roomId), JSON.stringify(meta), ttl);
  await saveRoomParticipants(roomId, [{ phone: createdBy, lastSeen: now, role: "owner" }]);
  await upsertRoomUserIndex(createdBy, roomId, now);
  return meta;
}

export async function joinRoomParticipant(roomId: string, phone: string): Promise<RoomParticipant[]> {
  const ttl = roomInactiveTtlSec();
  const now = Date.now();
  const participants = await getRoomParticipants(roomId);
  const idx = participants.findIndex((p) => p.phone === phone);
  if (idx >= 0) {
    participants[idx] = { ...participants[idx], phone, lastSeen: now };
  } else {
    participants.push({ phone, lastSeen: now, role: "member" });
  }
  await saveRoomParticipants(roomId, participants);
  await upsertRoomUserIndex(phone, roomId, now);
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

export async function setRoomParticipantRole(
  roomId: string,
  targetPhone: string,
  role: "admin" | "member",
): Promise<RoomParticipant[]> {
  const participants = await getRoomParticipants(roomId);
  const next = participants.map((p) =>
    p.phone === targetPhone ? { ...p, role } : p,
  );
  await saveRoomParticipants(roomId, next);
  await redisExpire(roomMetaKey(roomId), roomInactiveTtlSec());
  return next;
}

export async function addRoomParticipant(
  roomId: string,
  targetPhone: string,
  role: "admin" | "member" = "member",
): Promise<RoomParticipant[]> {
  const participants = await getRoomParticipants(roomId);
  const now = Date.now();
  const exists = participants.some((p) => p.phone === targetPhone);
  const next = exists
    ? participants.map((p) => (p.phone === targetPhone ? { ...p, role, lastSeen: now } : p))
    : [...participants, { phone: targetPhone, lastSeen: now, role }];
  await saveRoomParticipants(roomId, next);
  await upsertRoomUserIndex(targetPhone, roomId, now);
  await redisExpire(roomMetaKey(roomId), roomInactiveTtlSec());
  return next;
}

export async function removeRoomParticipant(
  roomId: string,
  targetPhone: string,
): Promise<{ deletedRoom: boolean; participants: RoomParticipant[] }> {
  const participants = await getRoomParticipants(roomId);
  const next = participants.filter((p) => p.phone !== targetPhone);
  await removeRoomUserIndex(targetPhone, roomId);
  if (next.length === 0) {
    await deleteRoom(roomId);
    return { deletedRoom: true, participants: [] };
  }
  await saveRoomParticipants(roomId, next);
  await redisExpire(roomMetaKey(roomId), roomInactiveTtlSec());
  return { deletedRoom: false, participants: next };
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
  await removeRoomUserIndex(phone, roomId);
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
  const participants = await getRoomParticipants(roomId);
  await Promise.all(participants.map((p) => removeRoomUserIndex(p.phone, roomId)));
  await redisDel(
    roomMetaKey(roomId),
    roomParticipantsKey(roomId),
    roomMessagesKey(roomId),
    roomAvatarStorageKey(roomId),
  );
}

export async function pushRoomMessage(roomId: string, msg: EncryptedMessagePayload): Promise<number> {
  return pushRoomEnvelope(roomId, { ...msg, kind: "message" });
}

export async function pushRoomEnvelope(roomId: string, envelope: ChannelEnvelope): Promise<number> {
  const version = await pushEnvelope(
    roomMessagesKey(roomId),
    roomMetaKey(roomId),
    envelope,
    () => getRoomMeta(roomId),
    roomInactiveTtlSec(),
    msgTtlSec(),
    maxRoomEnvelopes(),
  );
  void publishEnvelopesEvent({
    channel: `room:${roomId.toUpperCase()}`,
    version,
    envelopes: [envelope],
    excludePhone: "from" in envelope ? envelope.from : undefined,
  }).catch(() => {});
  return version;
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
