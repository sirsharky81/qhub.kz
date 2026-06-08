"use client";

import { getRules, REGIME_CONDITIONS } from "@/lib/tax-calculator/rules";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, RegimeId, RegimeSelection } from "@/lib/tax-calculator/types";

interface RegimeConditionsProps {
  regime: RegimeSelection;
  year: string;
  lang: Lang;
  compact?: boolean;
}

const ALL_REGIMES: RegimeId[] = ["simplified", "general", "self_employed", "kfh"];

function filterConditions(regimeId: RegimeId, year: number): typeof REGIME_CONDITIONS[RegimeId] {
  const rules = getRules(year);
  return REGIME_CONDITIONS[regimeId].filter((c) => {
    if (c.key === "condition.simplified.payroll_deduction") {
      return rules.regimes.simplified.payrollDeductionThresholdMrp != null;
    }
    return true;
  });
}

function ConditionList({
  regimeId,
  year,
  lang,
  compact,
}: {
  regimeId: RegimeId;
  year: number;
  lang: Lang;
  compact?: boolean;
}) {
  const conditions = filterConditions(regimeId, year);

  return (
    <ul className={compact ? "space-y-1" : "space-y-1.5"}>
      {conditions.map((c) => (
        <li
          key={c.key}
          className={
            "flex items-start gap-2 text-xs leading-relaxed " +
            (c.highlight ? "text-gray-800" : "text-gray-500")
          }
        >
          <span
            className={
              "mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 " +
              (c.highlight ? "bg-purple-500" : "bg-gray-300")
            }
          />
          <span>
            {t(lang, c.key)}
            {c.link && (
              <>
                {" "}
                <a
                  href={c.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 underline underline-offset-2 hover:text-purple-800 font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t(lang, c.link.labelKey)}
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function RegimeConditions({ regime, year, lang, compact }: RegimeConditionsProps) {
  const yearNum = parseInt(year, 10) || 2026;

  if (regime !== "compare_all") {
    return (
      <div className={compact ? "" : "rounded-xl border border-blue-100 bg-blue-50/40 p-4"}>
        {!compact && (
          <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider mb-2">
            {t(lang, "conditions.title")}
          </p>
        )}
        <ConditionList regimeId={regime} year={yearNum} lang={lang} compact={compact} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
        {t(lang, "conditions.title_all")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ALL_REGIMES.map((r) => (
          <div key={r} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-800 mb-2">{t(lang, `regime.${r}`)}</p>
            <ConditionList regimeId={r} year={yearNum} lang={lang} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
