export {
  formatMoney,
  parseAmountInput,
  formatAmountInput,
  formatNum,
} from "@/lib/credit-calculator/format";

export function roundTenge(n: number): number {
  return Math.round(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function clampIncomeToPeriod(income: number, period: "monthly" | "annual"): {
  monthly: number;
  annual: number;
} {
  if (period === "monthly") {
    return { monthly: income, annual: income * 12 };
  }
  return { monthly: income / 12, annual: income };
}
