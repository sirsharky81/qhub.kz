"use client";

import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, RegimeId, RegimeSelection } from "@/lib/tax-calculator/types";

const REGIMES: { id: RegimeSelection; labelKey: string }[] = [
  { id: "compare_all", labelKey: "opt.compare_all" },
  { id: "simplified", labelKey: "regime.simplified" },
  { id: "general", labelKey: "regime.general" },
  { id: "self_employed", labelKey: "regime.self_employed" },
  { id: "kfh", labelKey: "regime.kfh" },
];

interface RegimeSelectorProps {
  regime: RegimeSelection;
  lang: Lang;
  labelClass: string;
  onChange: (regime: RegimeSelection) => void;
}

export default function RegimeSelector({ regime, lang, labelClass, onChange }: RegimeSelectorProps) {
  return (
    <div>
      <label className={labelClass}>{t(lang, "lbl.regime")}</label>
      <div className="flex flex-wrap gap-2">
        {REGIMES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={
              "px-3 py-1.5 text-xs sm:text-sm rounded-lg border transition-colors " +
              (regime === r.id
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-700 hover:border-gray-400")
            }
          >
            {t(lang, r.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

export const REGIME_IDS: RegimeId[] = ["simplified", "general", "self_employed", "kfh"];
