"use client";

import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, TaxWarning } from "@/lib/tax-calculator/types";

interface LimitWarningsProps {
  warnings: TaxWarning[];
  lang: Lang;
}

export default function LimitWarnings({ warnings, lang }: LimitWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div
          key={w.id}
          className={
            "text-xs sm:text-sm px-3 py-2 rounded-lg border " +
            (w.severity === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-blue-50 border-blue-200 text-blue-700")
          }
        >
          {t(lang, w.messageKey)}
        </div>
      ))}
    </div>
  );
}
