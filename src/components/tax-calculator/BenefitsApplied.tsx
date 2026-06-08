"use client";

import { formatMoney } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, TaxResult } from "@/lib/tax-calculator/types";

interface BenefitsAppliedProps {
  result: TaxResult;
  lang: Lang;
}

export default function BenefitsApplied({ result, lang }: BenefitsAppliedProps) {
  if (result.appliedBenefits.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{t(lang, "benefits.none")}</p>;
  }

  return (
    <div className="space-y-3">
      {result.appliedBenefits.map((b) => (
        <div
          key={b.id}
          className="flex items-start justify-between gap-4 p-4 rounded-xl border border-emerald-100 bg-emerald-50/50"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800">{t(lang, b.labelKey)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t(lang, b.descriptionKey)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600">{t(lang, "benefits.savings")}</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{formatMoney(b.savings)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
