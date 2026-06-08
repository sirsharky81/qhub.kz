"use client";

import PayrollNetEstimate from "@/components/tax-calculator/PayrollNetEstimate";
import { formatAmountInput, parseAmountInput } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, Period } from "@/lib/tax-calculator/types";

interface EmploymentToggleProps {
  hasEmployees: boolean;
  employeePayroll: string;
  period: Period;
  year: string;
  lang: Lang;
  inputClass: string;
  labelClass: string;
  onHasEmployeesChange: (value: boolean) => void;
  onEmployeePayrollChange: (value: string) => void;
}

export default function EmploymentToggle({
  hasEmployees,
  employeePayroll,
  period,
  year,
  lang,
  inputClass,
  labelClass,
  onHasEmployeesChange,
  onEmployeePayrollChange,
}: EmploymentToggleProps) {
  function handlePayrollChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    onEmployeePayrollChange(digits === "" ? "" : formatAmountInput(digits));
  }

  return (
    <div className="space-y-3 pt-1 border-t border-gray-100">
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={hasEmployees}
          onChange={(e) => onHasEmployeesChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <span>
          <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
            {t(lang, "lbl.has_employees")}
          </span>
          <span className="block text-[11px] text-gray-400 mt-0.5 leading-snug">
            {t(lang, "hint.has_employees")}
          </span>
        </span>
      </label>

      {hasEmployees && (
        <div className="max-w-sm pl-7">
          <label className={labelClass}>{t(lang, "lbl.employee_payroll")}</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={employeePayroll}
              onChange={(e) => handlePayrollChange(e.target.value)}
              onBlur={() => {
                const n = parseAmountInput(employeePayroll);
                if (Number.isFinite(n)) onEmployeePayrollChange(formatAmountInput(n));
              }}
              className={inputClass + " pr-8"}
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₸</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{t(lang, "hint.employee_payroll")}</p>
          <PayrollNetEstimate gross={employeePayroll} period={period} year={year} lang={lang} />
        </div>
      )}
    </div>
  );
}
