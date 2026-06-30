import type { FamilyMemberType } from "./member-types";

export type FamilyMemberRole = "owner" | "tracked" | "observer";

export interface FamilyRoom {
  roomId: string;
  name: string;
  createdAt: number;
  ownerMemberId: string;
  memberIds: string[];
  messengerRoomId?: string | null;
  /** Доверенный номер для SOS-звонка участником */
  sosPhone?: string | null;
  version: number;
  updatedAt: number;
}

export interface FamilyMember {
  memberId: string;
  /** Empty until parent adopts via pair token */
  roomId: string;
  role: FamilyMemberRole;
  name: string;
  tokenHash: string;
  createdAt: number;
  /** Роль в семье для отслеживаемых участников */
  memberType?: FamilyMemberType;
  /** Родитель делится геопозицией с участниками */
  shareLocationWithChildren?: boolean;
  /** Родитель делится геопозицией с другими родителями */
  shareLocationWithParents?: boolean;
}

export type FamilyPairingStatus = "pending" | "paired";

export interface FamilyPairingRecord {
  pairToken: string;
  childName: string;
  memberId: string;
  status: FamilyPairingStatus;
  roomId?: string;
  roomName?: string;
  parentName?: string;
  createdAt: number;
}

export interface FamilyParentPublic {
  memberId: string;
  name: string;
  isCreator: boolean;
  shareLocationWithChildren: boolean;
  shareLocationWithParents: boolean;
}

export interface FamilyLocation {
  memberId: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery?: number | null;
  updatedAt: number;
}

export interface FamilySosState {
  memberId: string;
  active: boolean;
  lat: number;
  lng: number;
  startedAt: number;
}

export interface FamilyBindToken {
  roomId: string;
  role: "tracked" | "observer";
  name?: string;
}

export interface FamilyPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform?: "web" | "ios" | "android";
  nativeToken?: string;
}

export interface FamilyMemberPublic {
  memberId: string;
  role: FamilyMemberRole;
  name: string;
  memberType?: FamilyMemberType;
  shareLocationWithParents?: boolean;
}

export interface FamilyPollSnapshot {
  room: Omit<FamilyRoom, "ownerMemberId">;
  parent: FamilyParentPublic;
  parents: FamilyParentPublic[];
  members: FamilyMemberPublic[];
  locations: FamilyLocation[];
  sos: FamilySosState[];
  version: number;
}

export interface FamilySession {
  roomId: string;
  memberId: string;
  accessToken: string;
  role: FamilyMemberRole;
  name: string;
  roomName: string;
  parentName?: string;
}

export interface ChildPairingSession {
  pairToken: string;
  memberId: string;
  accessToken: string;
  name: string;
}
