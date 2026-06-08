import { getRegionRate } from "../../rules/regions";
import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { calculateIpnDeductions, collectAppliedBenefits } from "../deductions";
import { calcSimplifiedPayrollDeduction, normalizeExpenseInputs } from "../expense-deductions";
import { checkEligibility } from "../eligibility";
import { calculateSocialContributions } from "../social-contributions";
import { annualToDisplay, effectiveRate, scaleAnnualItemsToPeriod, toPeriodAmounts } from "../utils";

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
  const monthlyEmployeePayroll = input.hasEmployees
    ? toPeriodAmounts(input.employeePayroll ?? 0, input.period).monthly
    : 0;

  if (!isEligible) {
    return emptyResult(input, grossIncome, eligibilityWarnings, reasonKey);
  }

  const { annualPayrollExpenses } = normalizeExpenseInputs(input);
  const payrollResult = calcSimplifiedPayrollDeduction(annual, annualPayrollExpenses, input.period, rules);

  const warnings = [...eligibilityWarnings, ...payrollResult.warnings];
  const deductionsRaw = payrollResult.deduction ? [payrollResult.deduction] : [];
  const taxableAnnual = payrollResult.taxableIncome;

  const regionalRate = getRegionRate(input.regionId);
  const incomeTaxAnnual = roundTenge(taxableAnnual * regionalRate);

  const { applied: benefitDeductions } = calculateIpnDeductions(
    input.benefits,
    rules,
    "simplified",
    12,
    input.disabledChildrenCount ?? 1
  );

  const benefitSavingsAnnual = benefitDeductions.reduce((s, b) => s + b.savings, 0);
  const adjustedTaxAnnual = Math.max(0, incomeTaxAnnual - benefitSavingsAnnual);

  const social = calculateSocialContributions({
    monthlyIncome: monthly,
    monthlyEmployeePayroll,
    hasEmployees: input.hasEmployees,
    benefits: input.benefits,
    rules,
    periodMultiplier,
    regimeId: "simplified",
  });

  const totalTaxes = annualToDisplay(adjustedTaxAnnual, input.period);
  const totalSocial = social.total;
  const totalPayments = totalTaxes + totalSocial;
  const netIncome = Math.max(0, grossIncome - totalPayments);

  const deductions = scaleAnnualItemsToPeriod(deductionsRaw, input.period);

  const lineItems = [
    ...(payrollResult.deduction
      ? [
          {
            id: "payroll_deduction",
            labelKey: "deduction.payroll",
            amount: annualToDisplay(payrollResult.deduction.amount, input.period),
            formula: payrollResult.deduction.formula ?? "",
            category: "deduction" as const,
          },
        ]
      : []),
    {
      id: "income_tax",
      labelKey: "payment.income_tax",
      amount: totalTaxes,
      formula: `${(regionalRate * 100).toFixed(1)}% × ${roundTenge(taxableAnnual).toLocaleString("ru-RU")} ₸/год`,
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  const taxableIncome = annualToDisplay(taxableAnnual, input.period);

  return {
    regime: "simplified",
    grossIncome,
    period: input.period,
    taxableIncome,
    totalTaxes,
    totalSocial,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalPayments, grossIncome),
    lineItems,
    deductions,
    appliedBenefits: collectAppliedBenefits({
      benefits: input.benefits,
      rules,
      regimeId: "simplified",
      period: input.period,
      monthlyIncome: monthly,
      monthlyEmployeePayroll,
      hasEmployees: input.hasEmployees,
      periodMultiplier,
      disabledChildrenCount: input.disabledChildrenCount ?? 1,
    }),
    warnings,
    isEligible: true,
  };
}
