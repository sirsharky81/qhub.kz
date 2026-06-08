import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { calculateIpnDeductions } from "../deductions";
import { checkEligibility } from "../eligibility";
import { calculateSocialContributions } from "../social-contributions";
import { effectiveRate, toPeriodAmounts } from "../utils";

export function calculateKfh(input: TaxInput, rules: TaxRuleSet): TaxResult {
  const { isEligible, reasonKey, warnings } = checkEligibility(input, "kfh", rules);
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const periodMultiplier = input.period === "monthly" ? 1 : 12;
  const grossIncome = input.period === "monthly" ? monthly : annual;

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
  let incomeTax = roundTenge(annual * rate);

  const { total: benefitDeductionTotal, applied: benefitDeductions } = calculateIpnDeductions(
    input.benefits,
    rules,
    "kfh",
    periodMultiplier,
    input.disabledChildrenCount ?? 1
  );

  incomeTax = Math.max(0, incomeTax - benefitDeductionTotal);

  const social = calculateSocialContributions({
    monthlyIncome: monthly,
    benefits: input.benefits,
    rules,
    periodMultiplier,
  });

  const totalPayments = incomeTax + social.total;
  const netIncome = Math.max(0, grossIncome - totalPayments);

  const lineItems = [
    {
      id: "kfh_tax",
      labelKey: "payment.kfh_tax",
      amount: incomeTax,
      formula: `${(rate * 100).toFixed(0)}% × ${roundTenge(annual).toLocaleString("ru-RU")} ₸`,
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  return {
    regime: "kfh",
    grossIncome,
    period: input.period,
    totalTaxes: incomeTax,
    totalSocial: social.total,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalPayments, grossIncome),
    lineItems,
    deductions: [],
    appliedBenefits: benefitDeductions,
    warnings,
    isEligible: true,
  };
}
