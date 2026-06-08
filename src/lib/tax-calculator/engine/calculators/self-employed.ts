import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { checkEligibility } from "../eligibility";
import { calculateFlatSocial } from "../social-contributions";
import { effectiveRate, toPeriodAmounts } from "../utils";

export function calculateSelfEmployed(input: TaxInput, rules: TaxRuleSet): TaxResult {
  const { isEligible, reasonKey, warnings } = checkEligibility(input, "self_employed", rules);
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const periodMultiplier = input.period === "monthly" ? 1 : 12;
  const grossIncome = input.period === "monthly" ? monthly : annual;

  if (!isEligible) {
    return {
      regime: "self_employed",
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

  const rate = rules.regimes.self_employed.flatSocialRate ?? 0.04;
  const social = calculateFlatSocial(grossIncome, rate, periodMultiplier);

  const lineItems = [
    {
      id: "ipn_zero",
      labelKey: "payment.ipn_zero",
      amount: 0,
      formula: "ИПН = 0% для самозанятых",
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  const totalPayments = social.total;
  const netIncome = Math.max(0, grossIncome - totalPayments);

  return {
    regime: "self_employed",
    grossIncome,
    period: input.period,
    totalTaxes: 0,
    totalSocial: social.total,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalPayments, grossIncome),
    lineItems,
    deductions: [],
    appliedBenefits: [],
    warnings,
    isEligible: true,
  };
}
