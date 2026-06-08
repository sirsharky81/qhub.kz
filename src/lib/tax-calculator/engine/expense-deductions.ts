import type { TaxRuleSet } from "../rules/schema";
import type { Period, TaxDeduction, TaxWarning } from "../types";
import { roundTenge } from "../format";
import { toPeriodAmounts } from "./utils";

export function toAnnualAmount(amount: number, period: Period): number {
  return period === "monthly" ? amount * 12 : amount;
}

/** Вычет подтверждённых расходов на ОУР: налогооблагаемый доход = доход − расходы */
export function calcGeneralExpenseDeduction(
  annualIncome: number,
  businessExpenses: number,
  rules: TaxRuleSet
): { taxableIncome: number; deduction: TaxDeduction | null; warnings: TaxWarning[] } {
  const warnings: TaxWarning[] = [];
  const regime = rules.regimes.general;

  if (!regime.allowsBusinessExpenseDeduction || businessExpenses <= 0) {
    return { taxableIncome: annualIncome, deduction: null, warnings };
  }

  const applied = Math.min(businessExpenses, annualIncome);
  if (businessExpenses > annualIncome) {
    warnings.push({
      id: "expenses_exceed_income",
      messageKey: "warning.expenses_exceed_income",
      severity: "warning",
    });
  }

  return {
    taxableIncome: Math.max(0, annualIncome - applied),
    deduction: {
      labelKey: "deduction.business_expenses",
      amount: applied,
      formula: `${roundTenge(applied).toLocaleString("ru-RU")} ₸`,
    },
    warnings,
  };
}

/** Вычет ФОТ на упрощёнке: после превышения порога 24 000 МРП/год */
export function calcSimplifiedPayrollDeduction(
  annualIncome: number,
  payrollExpenses: number,
  period: Period,
  rules: TaxRuleSet
): {
  taxableIncome: number;
  deduction: TaxDeduction | null;
  warnings: TaxWarning[];
} {
  const warnings: TaxWarning[] = [];
  const regime = rules.regimes.simplified;
  const threshold = regime.payrollDeductionThresholdMrp;

  if (threshold == null || payrollExpenses <= 0) {
    if (payrollExpenses > 0 && threshold == null) {
      warnings.push({
        id: "payroll_not_available",
        messageKey: "warning.payroll_not_available_year",
        severity: "info",
      });
    }
    return { taxableIncome: annualIncome, deduction: null, warnings };
  }

  const thresholdAmount = threshold * rules.mrp;

  if (annualIncome <= thresholdAmount) {
    warnings.push({
      id: "payroll_below_threshold",
      messageKey: "warning.payroll_below_threshold",
      severity: "info",
    });
    return { taxableIncome: annualIncome, deduction: null, warnings };
  }

  const applied = Math.min(payrollExpenses, annualIncome);
  if (payrollExpenses > annualIncome) {
    warnings.push({
      id: "payroll_exceeds_income",
      messageKey: "warning.payroll_exceeds_income",
      severity: "warning",
    });
  }

  return {
    taxableIncome: Math.max(0, annualIncome - applied),
    deduction: {
      labelKey: "deduction.payroll",
      amount: applied,
      formula: `ФОТ при доходе > ${threshold.toLocaleString("ru-RU")} МРП`,
    },
    warnings,
  };
}

export function normalizeExpenseInputs(
  input: { period: Period; businessExpenses?: number; payrollExpenses?: number }
): { annualBusinessExpenses: number; annualPayrollExpenses: number } {
  return {
    annualBusinessExpenses: toAnnualAmount(input.businessExpenses ?? 0, input.period),
    annualPayrollExpenses: toAnnualAmount(input.payrollExpenses ?? 0, input.period),
  };
}
