import type { Period } from "../types";
import { roundTenge } from "../format";

export function toPeriodAmounts(income: number, period: Period): { monthly: number; annual: number } {
  if (period === "monthly") {
    return { monthly: income, annual: income * 12 };
  }
  return { monthly: income / 12, annual: income };
}

export function calcProgressiveTax(
  annualIncome: number,
  brackets: { upToMrp: number | null; rate: number }[],
  mrp: number
): number {
  let remaining = annualIncome;
  let tax = 0;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const limit = bracket.upToMrp === null ? Infinity : bracket.upToMrp * mrp;
    const taxableInBracket = Math.min(Math.max(remaining, 0), limit - prevLimit);
    if (taxableInBracket <= 0) break;
    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
    prevLimit = limit;
    if (remaining <= 0) break;
  }

  return roundTenge(tax);
}

export function effectiveRate(totalPayments: number, grossIncome: number): number {
  if (grossIncome <= 0) return 0;
  return Math.round((totalPayments / grossIncome) * 1000) / 10;
}

/** Перевод годовой суммы в выбранный пользователем период отображения */
export function annualToDisplay(annualAmount: number, period: Period): number {
  return period === "monthly" ? roundTenge(annualAmount / 12) : roundTenge(annualAmount);
}

/** Масштабирует суммы в lineItems и deductions к периоду отображения */
export function scaleAnnualItemsToPeriod<T extends { amount: number }>(
  items: T[],
  period: Period
): T[] {
  if (period === "annual") return items;
  return items.map((item) => ({ ...item, amount: annualToDisplay(item.amount, period) }));
}
