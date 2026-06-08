"use client";

import { formatMoney, formatPercent } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, TaxResult } from "@/lib/tax-calculator/types";

interface NetIncomeHeroProps {
  result: TaxResult;
  lang: Lang;
  isBest?: boolean;
}

export default function NetIncomeHero({ result, lang, isBest }: NetIncomeHeroProps) {
  return (
    <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-500/10 via-white to-purple-600/5 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-purple-700 font-medium">{t(lang, "hero.net_income")}</p>
        {isBest && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-600 text-white">
            {t(lang, "comparison.best")}
          </span>
        )}
      </div>
      <p className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums tracking-tight">
        {formatMoney(result.netIncome)}
        <span className="text-base font-medium text-gray-400 ml-2">
          {t(lang, result.period === "monthly" ? "per.month" : "per.year")}
        </span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:text-left sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            {t(lang, "hero.gross")} {t(lang, result.period === "monthly" ? "per.month_short" : "per.year_short")}
          </p>
          <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatMoney(result.grossIncome)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            {t(lang, "hero.payments")} {t(lang, result.period === "monthly" ? "per.month_short" : "per.year_short")}
          </p>
          <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatMoney(result.totalPayments)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">{t(lang, "hero.tax_burden")}</p>
          <p className="text-sm font-semibold text-purple-700 tabular-nums">{formatPercent(result.effectiveRate)}</p>
        </div>
      </div>
    </div>
  );
}
