"use client";

import { formatAmountInput, parseAmountInput } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, RegimeSelection } from "@/lib/tax-calculator/types";

interface ExpenseInputsProps {
  businessExpenses: string;
  payrollExpenses: string;
  regime: RegimeSelection;
  year: string;
  lang: Lang;
  inputClass: string;
  labelClass: string;
  onBusinessExpensesChange: (value: string) => void;
  onPayrollExpensesChange: (value: string) => void;
}

function AmountField({
  value,
  label,
  hint,
  inputClass,
  labelClass,
  onChange,
}: {
  value: string;
  label: string;
  hint: string;
  inputClass: string;
  labelClass: string;
  onChange: (v: string) => void;
}) {
  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    onChange(digits === "" ? "" : formatAmountInput(digits));
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            const n = parseAmountInput(value);
            if (Number.isFinite(n)) onChange(formatAmountInput(n));
          }}
          className={inputClass + " pr-8"}
          placeholder="0"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₸</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>
    </div>
  );
}

export default function ExpenseInputs({
  businessExpenses,
  payrollExpenses,
  regime,
  year,
  lang,
  inputClass,
  labelClass,
  onBusinessExpensesChange,
  onPayrollExpensesChange,
}: ExpenseInputsProps) {
  const showBusiness =
    regime === "general" || regime === "compare_all";
  const showPayroll =
    (regime === "simplified" || regime === "compare_all") && parseInt(year, 10) >= 2026;

  if (!showBusiness && !showPayroll) return null;

  return (
    <div className="space-y-4 pt-1 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {t(lang, "lbl.expenses_section")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {showBusiness && (
          <AmountField
            value={businessExpenses}
            label={t(lang, "lbl.business_expenses")}
            hint={t(lang, "hint.business_expenses")}
            inputClass={inputClass}
            labelClass={labelClass}
            onChange={onBusinessExpensesChange}
          />
        )}
        {showPayroll && (
          <AmountField
            value={payrollExpenses}
            label={t(lang, "lbl.payroll_expenses")}
            hint={t(lang, "hint.payroll_expenses")}
            inputClass={inputClass}
            labelClass={labelClass}
            onChange={onPayrollExpensesChange}
          />
        )}
      </div>
    </div>
  );
}
