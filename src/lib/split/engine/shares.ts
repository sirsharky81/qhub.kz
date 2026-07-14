import {
  allocateLargestRemainder,
  d,
  eqMoney,
  money,
  MONEY_SCALE,
  sumMoney,
} from "../decimal";
import type {
  ExpenseParticipantInput,
  ExpenseParticipantShare,
  Money,
  SplitMethod,
} from "../types";

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitValidationError";
  }
}

export interface NormalizeSharesInput {
  amountOriginal: Money;
  amountBase: Money;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantInput[];
}

export function computeAmountBase(amountOriginal: Money, exchangeRate: Money): Money {
  if (!d(amountOriginal).gt(0)) throw new SplitValidationError("invalid_amount");
  if (!d(exchangeRate).gt(0)) throw new SplitValidationError("invalid_exchange_rate");
  return money(d(amountOriginal).mul(d(exchangeRate)), MONEY_SCALE);
}

export function normalizeShares(input: NormalizeSharesInput): ExpenseParticipantShare[] {
  const { amountOriginal, amountBase, splitMethod, participants } = input;
  if (participants.length === 0) throw new SplitValidationError("no_participants");
  const ids = new Set(participants.map((p) => p.memberId));
  if (ids.size !== participants.length) throw new SplitValidationError("duplicate_participant");

  switch (splitMethod) {
    case "equal":
      return normalizeEqual(amountBase, participants);
    case "fixed":
      return normalizeFixed(amountOriginal, amountBase, participants);
    case "percentage":
      return normalizePercentage(amountBase, participants);
    case "shares":
      return normalizeParts(amountBase, participants);
    default:
      throw new SplitValidationError("invalid_split_method");
  }
}

function normalizeEqual(
  amountBase: Money,
  participants: ExpenseParticipantInput[],
): ExpenseParticipantShare[] {
  const weights = participants.map(() => "1");
  const amounts = allocateLargestRemainder(amountBase, weights);
  return participants.map((p, i) => ({
    memberId: p.memberId,
    inputValue: null,
    amountBase: amounts[i]!,
  }));
}

function normalizeFixed(
  amountOriginal: Money,
  amountBase: Money,
  participants: ExpenseParticipantInput[],
): ExpenseParticipantShare[] {
  const fixed = participants.map((p) => {
    if (p.inputValue == null || !d(p.inputValue).gte(0)) {
      throw new SplitValidationError("invalid_fixed_share");
    }
    return p.inputValue;
  });
  if (!eqMoney(sumMoney(fixed), money(amountOriginal))) {
    throw new SplitValidationError("fixed_sum_mismatch");
  }
  // Allocate in base currency proportional to fixed original amounts (LRM).
  const amounts = allocateLargestRemainder(amountBase, fixed);
  return participants.map((p, i) => ({
    memberId: p.memberId,
    inputValue: fixed[i]!,
    amountBase: amounts[i]!,
  }));
}

function normalizePercentage(
  amountBase: Money,
  participants: ExpenseParticipantInput[],
): ExpenseParticipantShare[] {
  const pcts = participants.map((p) => {
    if (p.inputValue == null || !d(p.inputValue).gte(0)) {
      throw new SplitValidationError("invalid_percentage");
    }
    return p.inputValue;
  });
  if (!eqMoney(sumMoney(pcts), "100.00")) {
    throw new SplitValidationError("percentage_sum_mismatch");
  }
  const amounts = allocateLargestRemainder(amountBase, pcts);
  return participants.map((p, i) => ({
    memberId: p.memberId,
    inputValue: pcts[i]!,
    amountBase: amounts[i]!,
  }));
}

function normalizeParts(
  amountBase: Money,
  participants: ExpenseParticipantInput[],
): ExpenseParticipantShare[] {
  const parts = participants.map((p) => {
    if (p.inputValue == null || !d(p.inputValue).gt(0)) {
      throw new SplitValidationError("invalid_shares");
    }
    return p.inputValue;
  });
  const amounts = allocateLargestRemainder(amountBase, parts);
  return participants.map((p, i) => ({
    memberId: p.memberId,
    inputValue: parts[i]!,
    amountBase: amounts[i]!,
  }));
}

export function assertSharesMatchTotal(shares: ExpenseParticipantShare[], amountBase: Money): void {
  const total = sumMoney(shares.map((s) => s.amountBase));
  if (!eqMoney(total, money(amountBase))) {
    throw new SplitValidationError("share_total_mismatch");
  }
}
