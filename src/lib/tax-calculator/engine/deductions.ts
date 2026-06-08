import type { TaxRuleSet } from "../rules/schema";
import type { AppliedBenefit, BenefitId, Period, RegimeId, SocialPaymentId } from "../types";
import { roundTenge } from "../format";
import { calculateSocialPaymentAmount } from "./social-contributions";
import { annualToDisplay } from "./utils";

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

export interface CollectAppliedBenefitsInput {
  benefits: BenefitId[];
  rules: TaxRuleSet;
  regimeId: RegimeId;
  period: Period;
  monthlyIncome: number;
  monthlyEmployeePayroll: number;
  hasEmployees: boolean;
  periodMultiplier: number;
  disabledChildrenCount: number;
}

/** Собирает все применённые льготы: вычеты по ИПН и освобождения от соцплатежей */
export function collectAppliedBenefits(input: CollectAppliedBenefitsInput): AppliedBenefit[] {
  const applied: AppliedBenefit[] = [];

  for (const benefitId of input.benefits) {
    const rule = input.rules.benefits.find((b) => b.id === benefitId);
    if (!rule || !rule.applicableRegimes.includes(input.regimeId)) continue;

    const hasIpn = Boolean(rule.ipnDeduction);
    const hasSocial = rule.exemptions.length > 0;
    if (!hasIpn && !hasSocial) continue;

    let savings = 0;

    if (hasIpn) {
      const { applied: ipnApplied } = calculateIpnDeductions(
        [benefitId],
        input.rules,
        input.regimeId,
        12,
        input.disabledChildrenCount
      );
      savings += annualToDisplay(
        ipnApplied.reduce((sum, b) => sum + b.savings, 0),
        input.period
      );
    }

    if (hasSocial) {
      for (const paymentId of rule.exemptions) {
        savings += calculateSocialPaymentAmount(
          paymentId,
          input.rules,
          input.monthlyIncome,
          input.monthlyEmployeePayroll,
          input.hasEmployees,
          input.periodMultiplier
        );
      }
    }

    applied.push({
      id: benefitId,
      labelKey: rule.labelKey,
      savings,
      descriptionKey: rule.descriptionKey,
    });
  }

  return applied;
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
