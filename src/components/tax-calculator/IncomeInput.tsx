"use client";

import { formatAmountInput, parseAmountInput } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, Period } from "@/lib/tax-calculator/types";

interface IncomeInputProps {
  income: string;
  period: Period;
  lang: Lang;
  inputClass: string;
  labelClass: string;
  onIncomeChange: (value: string) => void;
  onPeriodChange: (period: Period) => void;
}

export default function IncomeInput({
  income,
  period,
  lang,
  inputClass,
  labelClass,
  onIncomeChange,
  onPeriodChange,
}: IncomeInputProps) {
  function handleAmountChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    onIncomeChange(digits === "" ? "" : formatAmountInput(digits));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>{t(lang, "lbl.income")}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={income}
            onChange={(e) => handleAmountChange(e.target.value)}
            onBlur={() => {
              const n = parseAmountInput(income);
              if (Number.isFinite(n)) onIncomeChange(formatAmountInput(n));
            }}
            className={inputClass + " pr-8"}
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₸</span>
        </div>
      </div>
      <div>
        <label className={labelClass}>{t(lang, "lbl.period")}</label>
        <div className="flex gap-2">
          {(["monthly", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={
                "flex-1 px-3 py-2 text-sm rounded-lg border transition-colors " +
                (period === p
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-700 hover:border-gray-400")
              }
            >
              {t(lang, p === "monthly" ? "opt.monthly" : "opt.annual")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
