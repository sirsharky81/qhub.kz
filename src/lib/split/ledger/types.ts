import type { Money, SplitMethod, ExpenseParticipantShare } from "../types";

export type RoomAssetKind = "cash" | "bank" | "card" | "wallet" | "other";

export type OperationType =
  | "expense"
  | "contribution"
  | "settlement"
  | "transfer"
  | "withdrawal"
  | "exchange"
  | "custody_handoff"
  | "adjustment";

export type PaymentSource =
  | { kind: "member"; memberId: string }
  | { kind: "asset"; assetId: string };

export interface RoomAsset {
  id: string;
  roomId: string;
  name: string;
  kind: RoomAssetKind;
  /** One asset = one currency. */
  currency: string;
  /** Who holds / is responsible for this money. */
  custodianMemberId: string;
  createdAt: number;
}

export interface OperationBase {
  id: string;
  roomId: string;
  type: OperationType;
  createdAt: number;
  createdBy: string;
  comment?: string | null;
  clientMutationId?: string | null;
  locked?: boolean;
}

export interface ExpenseOperation extends OperationBase {
  type: "expense";
  description: string;
  amountOriginal: Money;
  currencyOriginal: string;
  exchangeRate: Money;
  amountBase: Money;
  categoryId: string;
  paymentSource: PaymentSource;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantShare[];
}

export interface ContributionOperation extends OperationBase {
  type: "contribution";
  fromMemberId: string;
  toAssetId: string;
  amount: Money;
  currency: string;
  amountBase: Money;
}

export interface SettlementOperation extends OperationBase {
  type: "settlement";
  fromMemberId: string;
  toMemberId: string;
  amountBase: Money;
}

export interface TransferOperation extends OperationBase {
  type: "transfer";
  fromAssetId: string;
  toAssetId: string;
  amount: Money;
  currency: string;
}

export interface WithdrawalOperation extends OperationBase {
  type: "withdrawal";
  fromAssetId: string;
  toMemberId: string;
  amount: Money;
  currency: string;
  amountBase: Money;
}

export interface ExchangeOperation extends OperationBase {
  type: "exchange";
  fromAssetId: string;
  fromAmount: Money;
  toAssetId: string;
  toAmount: Money;
}

export interface CustodyHandoffOperation extends OperationBase {
  type: "custody_handoff";
  assetId: string;
  toCustodianMemberId: string;
}

export interface AdjustmentOperation extends OperationBase {
  type: "adjustment";
  reason: string;
  memberDeltas: Array<{ memberId: string; deltaBase: Money }>;
  assetDeltas: Array<{ assetId: string; deltaNative: Money }>;
}

export type SplitOperation =
  | ExpenseOperation
  | ContributionOperation
  | SettlementOperation
  | TransferOperation
  | WithdrawalOperation
  | ExchangeOperation
  | CustodyHandoffOperation
  | AdjustmentOperation;

export interface AssetBalance {
  assetId: string;
  currency: string;
  custodianMemberId: string;
  name: string;
  kind: RoomAssetKind;
  balanceNative: Money;
  /** Balance in room base currency (via provided rates). */
  balanceBase: Money;
}

export interface LedgerMemberBalance {
  memberId: string;
  paidBase: Money;
  shareBase: Money;
  /** paid − share. With assets present, Σ nets ≈ Σ asset balances (base). */
  netBase: Money;
}

export interface LedgerSnapshot {
  members: LedgerMemberBalance[];
  assets: AssetBalance[];
  /** Σ member nets in base currency. */
  sumMemberNetsBase: Money;
  /** Σ asset balances in base currency. */
  sumAssetBalancesBase: Money;
  advancedSuggested: boolean;
}
