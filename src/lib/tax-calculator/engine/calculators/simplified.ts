import { getRegionRate } from "../../rules/regions";
import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { calculateIpnDeductions } from "../deductions";
import { calcSimplifiedPayrollDeduction, normalizeExpenseInputs } from "../expense-deductions";
import { checkEligibility } from "../eligibility";
import { calculateSocialContributions } from "../social-contributions";
import { effectiveRate, toPeriodAmounts } from "../utils";

function emptyResult(
  input: TaxInput,
  grossIncome: number,
  warnings: TaxResult["warnings"],
  reasonKey?: string
): TaxResult {
  return {
    regime: "simplified",
    grossIncome,
    period: input.period,
    totalTaxes: 0,
    totalSocial: 0,
    totalPayments: 0,
    netIncome: 0,
    effectiveRate: 0,
    lineItems: [],
    deductions: [],
    appliedBenefits: [],
    warnings,
    isEligible: false,
    ineligibilityReasonKey: reasonKey,
  };
}

export function calculateSimplified(input: TaxInput, rules: TaxRuleSet): TaxResult {
  const { isEligible, reasonKey, warnings: eligibilityWarnings } = checkEligibility(
    input,
    "simplified",
    rules
  );
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const periodMultiplier = input.period === "monthly" ? 1 : 12;
  const grossIncome = input.period === "monthly" ? monthly : annual;

  if (!isEligible) {
    return emptyResult(input, grossIncome, eligibilityWarnings, reasonKey);
  }

  const { annualPayrollExpenses } = normalizeExpenseInputs(input);
  const payrollResult = calcSimplifiedPayrollDeduction(annual, annualPayrollExpenses, input.period, rules);

  const warnings = [...eligibilityWarnings, ...payrollResult.warnings];
  const deductions = payrollResult.deduction ? [payrollResult.deduction] : [];
  const taxableAnnual = payrollResult.taxableIncome;

  const regionalRate = getRegionRate(input.regionId);
  const incomeTax = roundTenge(taxableAnnual * regionalRate);

  const social = calculateSocialContributions({
    monthlyIncome: monthly,
    benefits: input.benefits,
    rules,
    periodMultiplier,
  });

  const { applied: benefitDeductions } = calculateIpnDeductions(
    input.benefits,
    rules,
    "simplified",
    periodMultiplier,
    input.disabledChildrenCount ?? 1
  );

  const adjustedTax = Math.max(0, incomeTax - benefitDeductions.reduce((s, b) => s + b.savings, 0));
  const totalPayments = adjustedTax + social.total;
  const netIncome = Math.max(0, grossIncome - totalPayments);

  const lineItems = [
    ...(payrollResult.deduction
      ? [
          {
            id: "payroll_deduction",
            labelKey: "deduction.payroll",
            amount: payrollResult.deduction.amount,
            formula: payrollResult.deduction.formula ?? "",
            category: "deduction" as const,
          },
        ]
      : []),
    {
      id: "income_tax",
      labelKey: "payment.income_tax",
      amount: adjustedTax,
      formula: `${(regionalRate * 100).toFixed(1)}% × ${roundTenge(taxableAnnual).toLocaleString("ru-RU")} ₸`,
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  const taxableIncome =
    input.period === "monthly" ? roundTenge(taxableAnnual / 12) : taxableAnnual;

  return {
    regime: "simplified",
    grossIncome,
    period: input.period,
    taxableIncome,
    totalTaxes: adjustedTax,
    totalSocial: social.total,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalPayments, grossIncome),
    lineItems,
    deductions,
    appliedBenefits: benefitDeductions,
    warnings,
    isEligible: true,
  };
}
