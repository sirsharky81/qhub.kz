import { describe, expect, it } from "vitest";
import {
  buildAnnuitySchedule,
  buildDifferentiatedSchedule,
  calcEIR,
  calcInterest,
  computeScheduleTotals,
  parseDayBasis,
  round2,
  withDisbursementRow,
  yearBasis,
} from "./calculations";
import type { DayBasis } from "./types";

// Re-export closed-form helper for tests (inline duplicate to avoid export)
function annuityPaymentClosedTest(
  principal: number,
  annualRatePercent: number,
  periods: number,
  freq: number
): number {
  if (periods <= 0) return 0;
  if (annualRatePercent <= 0) return round2(principal / periods);
  const periodRate = annualRatePercent / 100 / (12 / freq);
  const factor = Math.pow(1 + periodRate, periods);
  return round2((principal * periodRate * factor) / (factor - 1));
}

const disbDate = new Date(2025, 0, 15);
const d30_360: DayBasis = { type: "d30_360", basis: 360 };

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(10.126)).toBe(10.13);
    expect(round2(10.124)).toBe(10.12);
  });
});

describe("parseDayBasis", () => {
  it("maps regulatory bases", () => {
    expect(parseDayBasis("360").type).toBe("act360");
    expect(parseDayBasis("365_366").type).toBe("act365_366");
    expect(parseDayBasis("365").type).toBe("act365_366");
    expect(parseDayBasis("30_360").type).toBe("d30_360");
  });
});

describe("calcInterest", () => {
  it("computes I = S*i*n/360 for 30 days", () => {
    const end = new Date(2025, 1, 15);
    const interest = calcInterest(1_000_000, 12, 30, d30_360, end);
    expect(interest).toBe(round2((1_000_000 * 0.12 * 30) / 360));
    expect(interest).toBe(10000);
  });
});

describe("yearBasis", () => {
  it("returns 366 for leap years", () => {
    expect(yearBasis(new Date(2024, 5, 1))).toBe(366);
    expect(yearBasis(new Date(2025, 5, 1))).toBe(365);
  });
});

describe("differentiated schedule", () => {
  it("uses S1 = round2(S/n)", () => {
    const result = buildDifferentiatedSchedule(1_000_000, 12, 12, disbDate, d30_360, 0, 1);
    const firstPay = result.rows.find((r) => !r.isGrace)!;
    expect(firstPay.principal).toBe(round2(1_000_000 / 12));
    expect(firstPay.principal).toBe(83333.33);
  });
});

describe("annuity schedule", () => {
  it("uses closed-form payment for equal periods", () => {
    const result = buildAnnuitySchedule(1_000_000, 12, 12, disbDate, d30_360, 0, 1);
    const expectedP = annuityPaymentClosedTest(1_000_000, 12, 12, 1);
    expect(result.payment).toBe(expectedP);
    expect(result.rows[0].month).toBe(1);
  });
});

describe("schedule totals", () => {
  it("sums payment rows excluding grace", () => {
    const result = buildAnnuitySchedule(1_000_000, 12, 12, disbDate, d30_360, 0, 1);
    const totals = computeScheduleTotals(result.rows);
    expect(totals.totalPayment).toBe(result.totalPaid);
    expect(totals.totalPrincipal).toBe(1_000_000);
  });
});

describe("withDisbursementRow", () => {
  it("prepends issuance row for regulatory export", () => {
    const result = buildAnnuitySchedule(1_000_000, 12, 12, disbDate, d30_360, 0, 1);
    const withDisb = withDisbursementRow(result.rows, disbDate, 1_000_000);
    expect(withDisb[0].isDisbursement).toBe(true);
    expect(withDisb[0].balance).toBe(1_000_000);
  });
});

describe("calcEIR", () => {
  it("returns positive rate for standard loan", () => {
    const result = buildAnnuitySchedule(1_000_000, 12, 12, disbDate, d30_360, 0, 1);
    const eir = calcEIR(1_000_000, result.rows, disbDate, d30_360);
    expect(eir).not.toBeNull();
    expect(eir!).toBeGreaterThan(12);
    expect(eir!).toBeLessThan(13);
  });
});
