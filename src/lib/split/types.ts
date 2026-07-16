/** Money amounts are decimal strings — never float/double. */
export type Money = string;

/**
 * "family" splits proportional to household size (adults + children) — see
 * SplitFamily. The server resolves participants (any member of a household
 * stands in for the whole household) into per-representative weights before
 * allocating, then the math is identical to "shares".
 */
export type SplitMethod = "equal" | "fixed" | "percentage" | "shares" | "family";

export type SplitRoomRole = "owner" | "member";

export type SplitRoomStatus = "open" | "archived";

export type SplitInviteChannel = "link" | "qr" | "messenger";

/** Seat lifecycle: local → pending_invite → connected. */
export type ParticipantStatus = "local" | "pending_invite" | "connected";

/**
 * Declared at room creation, mostly a UI hint (copy + which panels are shown by
 * default) — the underlying engine treats all three the same way:
 * - individual: every member splits/settles on their own.
 * - own_family: one household travelling together — same engine, but the UI leans
 *   on personal (unsplit) expenses since there's nobody else to split with.
 * - multi_family: several households — enables the Families panel so a shared
 *   expense can be split proportionally by household size instead of per person.
 */
export type SplitRoomType = "individual" | "own_family" | "multi_family";

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
  /** See SplitRoomType. Missing on legacy rooms → treated as "individual". */
  roomType?: SplitRoomType;
}

/**
 * A household inside a room (see SplitRoomType "multi_family"). Children aren't
 * room members — they don't split/settle anything themselves — but they add to
 * the family's weight when an expense is split proportionally by household size.
 */
export interface SplitFamily {
  id: string;
  roomId: string;
  name: string;
  /** Adult room members belonging to this family. First entry is the "billing
   * representative": whoever's picked to carry the family's share of a
   * family-weighted expense on their personal balance (the household settles
   * internally — that's the whole point of grouping them). */
  memberIds: string[];
  childrenCount: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
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
  /**
   * Marked "for my own tracking, not meant to be split with the wider group"
   * (e.g. each family/person keeping their own hotel bill). Doesn't change the
   * engine at all — it's a display/report hint: personal expenses are excluded
   * from the "shared" category totals in computeSplitReport, but still count
   * fully towards whoever paid them in their own personal total.
   */
  personal?: boolean;
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
  /** Best-effort cache for the "my rooms" list — may go stale, refreshed on open. */
  roomName?: string;
  baseCurrency?: string;
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
