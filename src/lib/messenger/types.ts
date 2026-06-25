export type WhitelistStatus = "active" | "revoked";

export interface WhitelistEntry {
  phone: string;
  addedBy: string;
  addedAt: number;
  status: WhitelistStatus;
}

export interface MessengerAuthRecord {
  phone: string;
  pinHash: string | null;
  pinSetAt: number | null;
  mustChangePin: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
}

export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface ReceiptPayload {
  kind: "receipt";
  id: string;
  refMessageId: string;
  receipt: "delivered" | "read";
  from: string;
  ts: number;
}

export type ChannelEnvelope =
  | (EncryptedMessagePayload & { kind?: "message" })
  | ReceiptPayload;

export interface MessengerProfile {
  phone: string;
  displayName: string | null;
  updatedAt: number;
}

export type MessageType = "text" | "image" | "file";

export interface EncryptedMessagePayload {
  id: string;
  from: string;
  ts: number;
  type: MessageType;
  ciphertext: string;
  iv: string;
  mime?: string;
  filename?: string;
}

export interface ChannelMeta {
  version: number;
  updatedAt: number;
}

export interface RoomMeta extends ChannelMeta {
  createdAt: number;
  createdBy: string;
}

export interface RoomParticipant {
  phone: string;
  lastSeen: number;
}

export interface RoomState {
  roomId: string;
  meta: RoomMeta;
  participants: RoomParticipant[];
  messages: EncryptedMessagePayload[];
}

export interface DmChannelState {
  chatId: string;
  meta: ChannelMeta;
  messages: EncryptedMessagePayload[];
}

export type DialogKind = "dm" | "room";

export interface MessengerPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface MessengerPresence {
  channel: string;
  at: number;
}

export interface LocalDialog {
  id: string;
  kind: DialogKind;
  title: string;
  peerPhone?: string;
  roomId?: string;
  createdAt: number;
  displayName?: string;
}
