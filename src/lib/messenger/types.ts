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

export type DeliveryStatus = "pending" | "queued" | "sent" | "delivered" | "read" | "failed";

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

export type MessageType = "text" | "image" | "file" | "audio" | "video";

export interface EncryptedMessagePayload {
  id: string;
  clientMessageId?: string;
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
  platform?: "web" | "ios" | "android";
  nativeToken?: string;
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

export type CallSignalType = "offer" | "answer" | "ice" | "reject" | "end" | "busy";
export type CallStatus = "ringing" | "connecting" | "active" | "ended";

export interface CallSession {
  callId: string;
  channel: string;
  caller: string;
  callee: string;
  status: CallStatus;
  version: number;
  signalSeq: number;
  createdAt: number;
  endedAt?: number;
  endReason?: string;
  /** Latest offer/answer SDP, kept on the session so clients can converge even if
   *  the discrete "offer"/"answer" signal was missed (rate limit, backgrounding, etc). */
  offerSdp?: string;
  answerSdp?: string;
}

export interface CallSignal {
  id: string;
  type: CallSignalType;
  from: string;
  ts: number;
  seq: number;
  payload?: string;
}
