import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { calculateIpnDeductions, collectAppliedBenefits } from "../deductions";
import { checkEligibility } from "../eligibility";
import { calculateSocialContributions } from "../social-contributions";
import { annualToDisplay, effectiveRate, toPeriodAmounts } from "../utils";

export function calculateKfh(input: TaxInput, rules: TaxRuleSet): TaxResult {
  const { isEligible, reasonKey, warnings } = checkEligibility(input, "kfh", rules);
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const periodMultiplier = input.period === "monthly" ? 1 : 12;
  const grossIncome = input.period === "monthly" ? monthly : annual;
  const monthlyEmployeePayroll = input.hasEmployees
    ? toPeriodAmounts(input.employeePayroll ?? 0, input.period).monthly
    : 0;

  if (!isEligible) {
    return {
      regime: "kfh",
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

  const rate = rules.regimes.kfh.incomeTaxRate ?? 0.03;
  let incomeTaxAnnual = roundTenge(annual * rate);

  const { total: benefitDeductionTotal, applied: benefitDeductions } = calculateIpnDeductions(
    input.benefits,
    rules,
    "kfh",
    12,
    input.disabledChildrenCount ?? 1
  );

  incomeTaxAnnual = Math.max(0, incomeTaxAnnual - benefitDeductionTotal);

  const social = calculateSocialContributions({
    monthlyIncome: monthly,
    monthlyEmployeePayroll,
    hasEmployees: input.hasEmployees,
    benefits: input.benefits,
    rules,
    periodMultiplier,
    regimeId: "kfh",
  });

  const totalTaxes = annualToDisplay(incomeTaxAnnual, input.period);
  const totalSocial = social.total;
  const totalPayments = totalTaxes + totalSocial;
  const netIncome = Math.max(0, grossIncome - totalPayments);

  const lineItems = [
    {
      id: "kfh_tax",
      labelKey: "payment.kfh_tax",
      amount: totalTaxes,
      formula: `${(rate * 100).toFixed(0)}% × ${roundTenge(annual).toLocaleString("ru-RU")} ₸/год`,
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  return {
    regime: "kfh",
    grossIncome,
    period: input.period,
    totalTaxes,
    totalSocial,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalPayments, grossIncome),
    lineItems,
    deductions: [],
    appliedBenefits: collectAppliedBenefits({
      benefits: input.benefits,
      rules,
      regimeId: "kfh",
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
