import type { TaxRuleSet } from "../rules/schema";
import type { AppliedBenefit, BenefitId, RegimeId, SocialPaymentId } from "../types";
import { roundTenge } from "../format";

export function getExemptedPayments(
  benefits: BenefitId[],
  rules: TaxRuleSet,
  regime: RegimeId
): Set<SocialPaymentId> {
  const exempted = new Set<SocialPaymentId>();

  for (const benefitId of benefits) {
    const rule = rules.benefits.find((b) => b.id === benefitId);
    if (!rule || !rule.applicableRegimes.includes(regime)) continue;
    for (const ex of rule.exemptions) {
      exempted.add(ex);
    }
  }

  return exempted;
}

export function calculateIpnDeductions(
  benefits: BenefitId[],
  rules: TaxRuleSet,
  regime: RegimeId,
  periodMultiplier: number,
  disabledChildrenCount: number
): { total: number; applied: AppliedBenefit[] } {
  const applied: AppliedBenefit[] = [];
  let total = 0;

  for (const benefitId of benefits) {
    const rule = rules.benefits.find((b) => b.id === benefitId);
    if (!rule || !rule.applicableRegimes.includes(regime) || !rule.ipnDeduction) continue;

    const { type, amountMrp, perChild } = rule.ipnDeduction;
    const multiplier = perChild ? Math.max(disabledChildrenCount, 1) : 1;
    let savings = 0;

    if (type === "fixed_mrp_annual") {
      savings = roundTenge(amountMrp * rules.mrp * multiplier);
    } else {
      savings = roundTenge(amountMrp * rules.mrp * periodMultiplier * multiplier);
    }

    total += savings;
    applied.push({
      id: benefitId,
      labelKey: rule.labelKey,
      savings,
      descriptionKey: rule.descriptionKey,
    });
  }

  return { total, applied };
}

export function resolveBenefitConflicts(benefits: BenefitId[], rules: TaxRuleSet): BenefitId[] {
  const resolved: BenefitId[] = [];

  for (const benefitId of benefits) {
    const rule = rules.benefits.find((b) => b.id === benefitId);
    if (!rule) continue;

    const hasConflict = rule.mutualExclusive?.some((ex) => resolved.includes(ex));
    if (!hasConflict) resolved.push(benefitId);
  }

  return resolved;
}
