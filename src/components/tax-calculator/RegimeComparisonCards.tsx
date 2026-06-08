"use client";

import { formatMoney, formatPercent } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, RegimeId, TaxResult } from "@/lib/tax-calculator/types";

interface RegimeComparisonCardsProps {
  results: TaxResult[];
  bestRegime: RegimeId | null;
  lang: Lang;
  selectedRegime?: RegimeId | null;
  onSelect?: (regime: RegimeId) => void;
}

export default function RegimeComparisonCards({
  results,
  bestRegime,
  lang,
  selectedRegime,
  onSelect,
}: RegimeComparisonCardsProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
      {results.map((r) => {
        const isBest = r.isEligible && r.regime === bestRegime;
        const isSelected = selectedRegime === r.regime;
        return (
          <button
            key={r.regime}
            type="button"
            onClick={() => r.isEligible && onSelect?.(r.regime)}
            disabled={!r.isEligible}
            className={
              "snap-start flex-shrink-0 w-[200px] sm:w-[220px] text-left rounded-xl border p-4 transition-all " +
              (isSelected
                ? "border-purple-400 bg-purple-50 shadow-sm ring-2 ring-purple-200"
                : r.isEligible
                  ? "border-gray-200 bg-white hover:border-purple-300 hover:shadow-sm"
                  : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed")
            }
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-800">{t(lang, `regime.${r.regime}`)}</span>
              {isBest && (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-600 text-white">
                  ★
                </span>
              )}
            </div>
            {r.isEligible ? (
              <>
                <p className="text-lg font-bold text-gray-900 tabular-nums">{formatMoney(r.netIncome)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t(lang, "comparison.rate")}: {formatPercent(r.effectiveRate)}
                </p>
              </>
            ) : (
              <p className="text-xs text-red-600 mt-1">
                {t(lang, r.ineligibilityReasonKey ?? "comparison.ineligible")}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
