export type ShareParticipantRole = "host" | "guest";

export type ShareSignalType = "offer" | "answer" | "ice";

export interface ShareRoom {
  roomId: string;
  roomCode: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  hostParticipantId: string;
  guestParticipantId?: string | null;
  closed: boolean;
  version: number;
}

export interface ShareParticipant {
  participantId: string;
  roomId: string;
  role: ShareParticipantRole;
  deviceName: string;
  tokenHash: string;
  joinedAt: number;
  lastSeen: number;
  left: boolean;
}

export interface ShareSignal {
  seq: number;
  fromParticipantId: string;
  type: ShareSignalType;
  payload?: string;
  createdAt: number;
}

export interface ShareSession {
  roomId: string;
  participantId: string;
  accessToken: string;
  role: ShareParticipantRole;
  deviceName: string;
  roomCode: string;
  inviteToken: string;
}

export interface ShareRoomPublic {
  roomId: string;
  roomCode: string;
  hostDeviceName: string;
  guestDeviceName?: string | null;
  full: boolean;
  closed: boolean;
  expiresAt: number;
  version: number;
}

export interface SharePollResponse {
  room: ShareRoomPublic;
  peer?: { participantId: string; deviceName: string; role: ShareParticipantRole } | null;
  signals: ShareSignal[];
  latestSeq: number;
}
