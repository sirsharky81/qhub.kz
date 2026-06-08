"use client";

import { calculateEmployeeNetPay } from "@/lib/tax-calculator/engine/employee-net-pay";
import { formatMoney, parseAmountInput } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import { getRules } from "@/lib/tax-calculator/rules";
import type { Lang, Period } from "@/lib/tax-calculator/types";

interface PayrollNetEstimateProps {
  gross: string;
  period: Period;
  year: string;
  lang: Lang;
}

export default function PayrollNetEstimate({ gross, period, year, lang }: PayrollNetEstimateProps) {
  const grossAmount = parseAmountInput(gross);
  const rulesYear = parseInt(year, 10);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0 || !Number.isFinite(rulesYear)) {
    return null;
  }

  const estimate = calculateEmployeeNetPay(grossAmount, period, getRules(rulesYear));
  if (!estimate) return null;

  const periodLabel = t(lang, period === "monthly" ? "per.month_short" : "per.year_short");

  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-blue-700">{t(lang, "lbl.payroll_net_estimate")}</span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatMoney(estimate.net)}
          <span className="text-xs font-normal text-gray-400 ml-1">{periodLabel}</span>
        </span>
      </div>
      <p className="text-[10px] text-blue-600/80 mt-1 leading-snug">{t(lang, "hint.payroll_net_estimate")}</p>
    </div>
  );
}
