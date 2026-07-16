/** Money amounts are decimal strings — never float/double. */
export type Money = string;

export type SplitMethod = "equal" | "fixed" | "percentage" | "shares";

export type SplitRoomRole = "owner" | "member";

export type SplitRoomStatus = "open" | "archived";

export type SplitInviteChannel = "link" | "qr" | "messenger";

/** Seat lifecycle: local → pending_invite → connected. */
export type ParticipantStatus = "local" | "pending_invite" | "connected";

export interface RoomFxRate {
  currency: string;
  /** Units of base currency per 1 unit of this currency. */
  rate: Money;
  updatedAt: number;
  updatedBy: string;
}

export interface SplitRoom {
  roomId: string;
  name: string;
  baseCurrency: string;
  rates: RoomFxRate[];
  status: SplitRoomStatus;
  ownerMemberId: string;
  memberIds: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Progressive disclosure: assets / contributions UI. */
  advancedAccounting?: boolean;
}

export interface SplitMember {
  memberId: string;
  roomId: string;
  displayName: string;
  role: SplitRoomRole;
  /** Missing on legacy rows → inferred from tokenHash. */
  status: ParticipantStatus;
  /** Present only when status=connected (and sessions exist). */
  tokenHash?: string | null;
  /** Extra access-token hashes for whitelisted devices. */
  sessionTokenHashes?: string[];
  /** SHA-256 device keys allowed to open additional sessions. */
  deviceWhitelist?: string[];
  linkedUserId?: string | null;
  avatarUrl?: string | null;
  joinedAt: number;
  leftAt?: number | null;
}

export interface SplitInvitation {
  token: string;
  roomId: string;
  role: SplitRoomRole;
  channel: SplitInviteChannel;
  expiresAt: number;
  createdBy: string;
  createdAt: number;
  /** When set, join claims this Participant instead of creating a new one. */
  seatMemberId?: string | null;
  /** Seat-bound invites are one-shot after successful claim. */
  consumedAt?: number | null;
}

/** Member as returned to clients (no secrets). */
export type SplitMemberPublic = Omit<SplitMember, "tokenHash" | "sessionTokenHashes">;

export interface ExpenseParticipantInput {
  memberId: string;
  /** fixed amount (original currency), percent, or share parts — ignored for equal. */
  inputValue?: Money;
}

export interface ExpenseParticipantShare {
  memberId: string;
  inputValue: Money | null;
  amountBase: Money;
}

export interface SplitExpense {
  id: string;
  roomId: string;
  description: string;
  amountOriginal: Money;
  currencyOriginal: string;
  exchangeRate: Money;
  exchangeTimestamp: number;
  amountBase: Money;
  categoryId: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  participantIds: string[];
  participants: ExpenseParticipantShare[];
  comment?: string | null;
  geo?: { lat: number; lng: number } | null;
  locked: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  clientMutationId?: string | null;
}

/**
 * Acceptance flow for money-changing-hands records (settlements, withdrawals):
 * "confirmed" as soon as the recipient side either performed the action themselves
 * or cannot ever confirm themselves (a local participant, acted for by whoever recorded
 * it — usually the room owner). "pending" while a *connected* recipient hasn't yet
 * acknowledged receipt via a separate confirm action.
 */
export type ConfirmationStatus = "pending" | "confirmed";

export interface DebtSettlement {
  id: string;
  roomId: string;
  fromMemberId: string;
  toMemberId: string;
  amountBase: Money;
  date: string;
  comment?: string | null;
  createdBy: string;
  createdAt: number;
  clientMutationId?: string | null;
  /** Recipient (toMemberId) acceptance — see ConfirmationStatus. */
  status: ConfirmationStatus;
  confirmedBy?: string | null;
  confirmedAt?: number | null;
}

export interface MemberBalance {
  memberId: string;
  paidBase: Money;
  shareBase: Money;
  /** Balance = Paid − Share. Positive = creditor, negative = debtor. */
  netBase: Money;
}

export interface SuggestedSettlement {
  fromMemberId: string;
  toMemberId: string;
  amountBase: Money;
}

export interface SplitCategory {
  id: string;
  key: string;
  labelRu: string;
}

export interface SplitSession {
  roomId: string;
  memberId: string;
  accessToken: string;
  displayName: string;
  role: SplitRoomRole;
}

export interface SplitRoomSnapshot {
  room: SplitRoom;
  members: SplitMemberPublic[];
  expenses: SplitExpense[];
  settlements: DebtSettlement[];
  balances: MemberBalance[];
  suggestions: SuggestedSettlement[];
  expensesLocked: boolean;
  version: number;
}

import type { LedgerSnapshot, SplitOperation } from "./ledger";

export type { LedgerSnapshot, SplitOperation, AssetBalance } from "./ledger";

export interface SplitLedgerResponse {
  room: SplitRoom;
  ledger: LedgerSnapshot;
  operations: SplitOperation[];
  suggestions: SuggestedSettlement[];
}
