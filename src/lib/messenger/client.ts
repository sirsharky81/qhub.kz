import type {
  ChannelEnvelope,
  EncryptedMessagePayload,
  MessageType,
  ReceiptPayload,
} from "./types";
import { platformFetch } from "@/lib/platform/api-client";
import { PlatformOfflineQueue } from "@/lib/platform/offlineQueue";
import {
  clearMessengerSessionToken,
  primeMessengerSessionTokenCache,
  saveMessengerSessionToken,
} from "./session-token";

export interface AccessCheckResult {
  allowed: boolean;
  phone?: string;
  passwordSet?: boolean;
  mustChangePin?: boolean;
  messengerLoggedIn?: boolean;
  lockedUntil?: number | null;
}

export interface IdentifyResult {
  ok: boolean;
  phone?: string;
  maskedPhone?: string;
  passwordSet?: boolean;
  mustChangePin?: boolean;
  lockedUntil?: number | null;
  error?: string;
}

let accessCache: { at: number; data: AccessCheckResult } | null = null;
const ACCESS_STALE_MS = 60_000;

export async function fetchAccessCheck(force = false): Promise<AccessCheckResult> {
  if (!force && accessCache && Date.now() - accessCache.at < ACCESS_STALE_MS) {
    return accessCache.data;
  }
  const res = await platformFetch("/api/messenger/access-check");
  const data = (await res.json()) as AccessCheckResult;
  accessCache = { at: Date.now(), data };
  return data;
}

export function invalidateAccessCache(): void {
  accessCache = null;
}

export async function identifyMessenger(phone: string, captchaToken?: string): Promise<IdentifyResult> {
  const res = await platformFetch("/api/messenger/auth/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, captchaToken }),
  });
  return res.json() as Promise<IdentifyResult>;
}

export async function loginMessenger(phone: string, pin: string, captchaToken?: string) {
  const res = await platformFetch("/api/messenger/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin, captchaToken }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    mustChangePin?: boolean;
    lockedUntil?: number;
    token?: string;
  };
  if (data.ok && data.token) {
    await saveMessengerSessionToken(data.token);
    primeMessengerSessionTokenCache(data.token);
    invalidateAccessCache();
  }
  return data;
}

/** Verify PIN when session already exists (PIN unlock — no CAPTCHA). */
export async function verifyMessengerPin(pin: string): Promise<{
  ok: boolean;
  error?: string;
  lockedUntil?: number;
}> {
  const res = await platformFetch("/api/messenger/auth/verify-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string; lockedUntil?: number }>;
}

export async function setMessengerPin(phone: string, pin: string, confirmPin: string) {
  const res = await platformFetch("/api/messenger/auth/set-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin, confirmPin }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (data.ok) invalidateAccessCache();
  return data;
}

export async function changeMessengerPin(
  currentPin: string,
  newPin: string,
  confirmPin: string,
): Promise<{ ok?: boolean; error?: string; lockedUntil?: number }> {
  const res = await platformFetch("/api/messenger/auth/change-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPin, newPin, confirmPin }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; lockedUntil?: number };
  if (data.ok) invalidateAccessCache();
  return data;
}

export async function logoutMessenger() {
  await platformFetch("/api/messenger/auth/logout", { method: "DELETE" });
  await clearMessengerSessionToken();
  primeMessengerSessionTokenCache(null);
  invalidateAccessCache();
}

export async function publishPublicKey(publicKey: string) {
  await platformFetch("/api/messenger/pubkey", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey }),
  });
}

export async function fetchPeerPublicKey(phone: string): Promise<string | null> {
  const res = await platformFetch(`/api/messenger/pubkey?phone=${encodeURIComponent(phone)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey: string };
  return data.publicKey;
}

export async function fetchContacts(): Promise<
  { phone: string; displayName: string | null; label: string; online?: boolean }[]
> {
  const res = await platformFetch("/api/messenger/contacts");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    contacts: { phone: string; displayName: string | null; label: string; online?: boolean }[];
  };
  return data.contacts;
}

export interface DmDialogsResponseItem {
  chatId: string;
  peerPhone: string;
  label: string;
  displayName: string | null;
  lastMessageAt: number;
  latestUnreadAt: number | null;
  unreadCount: number;
  peerOnline: boolean;
}

export async function fetchDmDialogs(): Promise<DmDialogsResponseItem[]> {
  const res = await platformFetch("/api/messenger/dialogs");
  if (!res.ok) return [];
  const data = (await res.json()) as { dialogs?: DmDialogsResponseItem[] };
  return data.dialogs ?? [];
}

export async function pingMessengerPresence(): Promise<void> {
  try {
    await platformFetch("/api/messenger/presence", { method: "POST" });
  } catch {
    // best-effort heartbeat
  }
}

export async function fetchProfile(): Promise<{
  phone: string;
  displayName: string | null;
} | null> {
  const res = await platformFetch("/api/messenger/profile");
  if (!res.ok) return null;
  return res.json() as Promise<{ phone: string; displayName: string | null }>;
}

export async function updateProfile(displayName: string): Promise<boolean> {
  const res = await platformFetch("/api/messenger/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return res.ok;
}

export async function fetchProfilesMap(): Promise<Record<string, string>> {
  const contacts = await fetchContacts();
  const map: Record<string, string> = {};
  for (const c of contacts) {
    map[c.phone] = c.label;
  }
  return map;
}

export async function createRoom(): Promise<{ roomId: string; channel: string } | null> {
  const res = await platformFetch("/api/messenger/room", { method: "POST" });
  if (!res.ok) return null;
  return res.json() as Promise<{ roomId: string; channel: string }>;
}

export async function joinRoomApi(
  roomId: string,
): Promise<{ ok: boolean; error?: string; channel?: string }> {
  const res = await platformFetch("/api/messenger/room/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, action: "join" }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; channel?: string };
  if (!res.ok) return { ok: false, error: data.error ?? "Ошибка" };
  return { ok: true, channel: data.channel };
}

export async function leaveRoomApi(roomId: string) {
  const res = await platformFetch("/api/messenger/room/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, action: "leave" }),
  });
  return res.json();
}

export interface RoomStatusResult {
  roomId: string;
  channel: string;
  participantCount: number;
  isMember: boolean;
  otherCount: number;
}

export async function fetchRoomStatus(roomId: string): Promise<RoomStatusResult | null> {
  const res = await platformFetch(`/api/messenger/room?roomId=${encodeURIComponent(roomId.toUpperCase())}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<RoomStatusResult>;
}

export type PollChannelResult =
  | {
      meta: { version: number };
      messages: EncryptedMessagePayload[];
      envelopes: ChannelEnvelope[];
      participants?: { phone: string; lastSeen: number; displayName?: string | null }[];
      peerOnline?: boolean;
    }
  | { error: "room_gone" };

function isReceiptEnvelope(e: ChannelEnvelope): e is ReceiptPayload {
  return "kind" in e && e.kind === "receipt";
}

export async function pollChannel(
  channel: string,
  since: number,
  heartbeat = false,
): Promise<PollChannelResult | null> {
  const params = new URLSearchParams({
    channel,
    since: String(since),
  });
  if (heartbeat) params.set("heartbeat", "1");
  const res = await platformFetch(`/api/messenger/poll?${params}`);
  if (res.status === 410) {
    return { error: "room_gone" };
  }
  if (res.status === 304) {
    return { meta: { version: since }, messages: [], envelopes: [] };
  }
  if (!res.ok) return null;
  const data = (await res.json()) as {
    meta: { version: number };
    messages: EncryptedMessagePayload[];
    envelopes?: ChannelEnvelope[];
    participants?: { phone: string; lastSeen: number }[];
    peerOnline?: boolean;
  };
  const envelopes =
    data.envelopes ??
    (data.messages ?? []).map((m) => ({ ...m, kind: "message" as const }));
  return {
    meta: data.meta,
    messages: data.messages ?? [],
    envelopes,
    participants: data.participants,
    peerOnline: data.peerOnline,
  };
}

export async function sendEncryptedMessage(input: {
  channel: string;
  clientMessageId?: string;
  type: MessageType;
  ciphertext: string;
  iv: string;
  mime?: string;
  filename?: string;
}): Promise<{ messageId: string; version: number; queued: boolean } | null> {
  const res = await platformFetch("/api/messenger/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) {
    const data = (await res.json()) as { messageId: string; version: number };
    return { ...data, queued: false };
  }
  await PlatformOfflineQueue.enqueue({
    type: "message",
    endpoint: "/api/messenger/send",
    payload: input,
  });
  return { messageId: input.clientMessageId ?? `pending-${Date.now()}`, version: 0, queued: true };
}

export async function sendReceipt(input: {
  channel: string;
  refMessageId: string;
  receipt: "delivered" | "read";
}): Promise<{ messageId: string; version: number } | null> {
  const res = await platformFetch("/api/messenger/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: input.channel,
      kind: "receipt",
      refMessageId: input.refMessageId,
      receipt: input.receipt,
    }),
  });
  if (res.ok) {
    return res.json() as Promise<{ messageId: string; version: number }>;
  }
  await PlatformOfflineQueue.enqueue({
    type: "readReceipt",
    endpoint: "/api/messenger/send",
    payload: {
      channel: input.channel,
      kind: "receipt",
      refMessageId: input.refMessageId,
      receipt: input.receipt,
    },
  });
  return { messageId: input.refMessageId, version: 0 };
}

export { isReceiptEnvelope };

export async function ackMessage(channel: string, messageId: string) {
  await PlatformOfflineQueue.enqueue({
    type: "messageAck",
    endpoint: "/api/messenger/ack",
    payload: { channel, messageId },
  });
}
