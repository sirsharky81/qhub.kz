import {
  buildAnnuitySchedule,
  buildDifferentiatedSchedule,
  calcEIR,
  parseDayBasis,
  parseDisbursementDate,
} from "./calculations";
import { parseAmountInput, parseRateInput } from "./format";
import { t } from "./i18n";
import type { CalculationResult, CommissionType, Lang, LoanInput } from "./types";

export interface FormValues {
  amount: string;
  rate: string;
  dayBasis: string;
  term: string;
  disbursementDate: string;
  gracePeriod: string;
  paymentFreq: string;
  commissionVal: string;
  commissionType: CommissionType;
}

export function validateInputs(
  values: FormValues,
  lang: Lang
): { input: LoanInput } | { error: string } {
  const principal = parseAmountInput(values.amount);
  const rate = parseRateInput(values.rate);
  const months = Math.floor(Number(values.term));
  const graceMonths = Math.max(0, Math.floor(Number(values.gracePeriod)) || 0);
  const freq = Number(values.paymentFreq) === 3 ? (3 as const) : (1 as const);

  if (!Number.isFinite(principal) || principal <= 0) return { error: t(lang, "err.amount") };
  if (!Number.isFinite(rate) || rate < 0) return { error: t(lang, "err.rate") };
  if (!Number.isFinite(months) || months < 1) return { error: t(lang, "err.term") };

  const totalPeriods = Math.floor(months / freq);
  if (totalPeriods < 1) return { error: t(lang, "err.periods") };

  const gracePeriods = Math.floor(graceMonths / freq);
  if (gracePeriods >= totalPeriods) return { error: t(lang, "err.grace") };

  const disbursement = parseDisbursementDate(values.disbursementDate);
  if (!disbursement) return { error: t(lang, "err.disbursement") };

  const commissionVal = Math.max(0, parseAmountInput(values.commissionVal) || 0);
  const commissionType = values.commissionType;
  let commissionAmt: number;

  if (commissionType === "pct") {
    if (commissionVal > 100) return { error: t(lang, "err.commissionPct") };
    commissionAmt = (principal * commissionVal) / 100;
  } else {
    if (commissionVal > principal) return { error: t(lang, "err.commissionSum") };
    commissionAmt = commissionVal;
  }

  return {
    input: {
      principal,
      rate,
      months,
      disbursement,
      dayBasis: parseDayBasis(values.dayBasis),
      gracePeriods,
      graceMonths,
      freq,
      commissionAmt,
      commissionVal,
      commissionType,
      netPrincipal: principal - commissionAmt,
    },
  };
}

export function runCalculation(input: LoanInput): CalculationResult {
  const { principal, rate, months, disbursement, dayBasis, gracePeriods, freq, netPrincipal } =
    input;

  const annuity = buildAnnuitySchedule(
    principal,
    rate,
    months,
    disbursement,
    dayBasis,
    gracePeriods,
    freq
  );
  const diff = buildDifferentiatedSchedule(
    principal,
    rate,
    months,
    disbursement,
    dayBasis,
    gracePeriods,
    freq
  );

  return {
    input,
    annuity,
    diff,
    annuityEIR: calcEIR(netPrincipal, annuity.rows, disbursement),
    diffEIR: calcEIR(netPrincipal, diff.rows, disbursement),
  };
}
