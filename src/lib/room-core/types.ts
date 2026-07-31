export type RoomCoreServiceId = "share";

export type RoomCoreInviteChannel = "link" | "qr" | "code";

export interface RoomCoreServiceConfig {
  serviceId: RoomCoreServiceId;
  /** Redis key prefix, e.g. room-core:share: */
  redisPrefix: string;
  maxMembers: number;
  ttlSec: number;
  ownerRole: string;
  memberRole: string;
}

export interface RoomCoreRoom {
  roomId: string;
  serviceId: RoomCoreServiceId;
  roomCode: string;
  inviteTokenHash: string;
  createdAt: number;
  expiresAt: number;
  ownerMemberId: string;
  memberIds: string[];
  maxMembers: number;
  closed: boolean;
  version: number;
  /** SHA-256 hash of optional room PIN (4–8 digits). */
  pinHash?: string | null;
}

export interface RoomCoreMember {
  memberId: string;
  roomId: string;
  displayName: string;
  role: string;
  tokenHash: string;
  joinedAt: number;
  lastSeen: number;
  left: boolean;
}

export interface RoomCoreCreateResult {
  room: RoomCoreRoom;
  member: RoomCoreMember;
  accessToken: string;
  inviteToken: string;
}

export interface RoomCoreJoinResult {
  room: RoomCoreRoom;
  member: RoomCoreMember;
  accessToken: string;
}

export interface RoomCoreRoomPublic {
  roomId: string;
  roomCode: string;
  ownerDisplayName: string;
  memberCount: number;
  maxMembers: number;
  full: boolean;
  closed: boolean;
  expiresAt: number;
  version: number;
}

export interface RoomCoreSnapshot {
  room: RoomCoreRoomPublic;
  members: Array<{ memberId: string; displayName: string; role: string }>;
  self?: RoomCoreMember;
}
