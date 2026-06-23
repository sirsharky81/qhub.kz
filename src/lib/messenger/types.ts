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

export interface LocalDialog {
  id: string;
  kind: DialogKind;
  title: string;
  peerPhone?: string;
  roomId?: string;
  createdAt: number;
}
