import type { TaxRuleSet } from "../rules/schema";
import type { BenefitId, PaymentLineItem, RegimeId, SocialPaymentId } from "../types";
import { roundTenge } from "../format";
import { getExemptedPayments } from "./deductions";

export interface SocialCalcInput {
  monthlyIncome: number;
  monthlyEmployeePayroll: number;
  hasEmployees: boolean;
  benefits: BenefitId[];
  rules: TaxRuleSet;
  periodMultiplier: number;
  regimeId: RegimeId;
}

function calcBase(
  monthlyIncome: number,
  minMzp: number,
  maxMzp: number | null,
  mzp: number
): number {
  const minBase = minMzp * mzp;
  const incomeBase = Math.max(monthlyIncome, minBase);
  if (maxMzp === null) return incomeBase;
  return Math.min(incomeBase, maxMzp * mzp);
}

/** Сумма одного соцплатежа без учёта льгот (в периоде отображения) */
export function calculateSocialPaymentAmount(
  paymentId: SocialPaymentId,
  rules: TaxRuleSet,
  monthlyIncome: number,
  monthlyEmployeePayroll: number,
  hasEmployees: boolean,
  periodMultiplier: number
): number {
  const rule = rules.socialContributions.find((r) => r.id === paymentId);
  if (!rule) return 0;

  if (rule.id === "opvr") {
    if (!hasEmployees) return 0;
    const base = calcBase(monthlyEmployeePayroll, rule.minBaseMzp, rule.maxBaseMzp, rules.mzp);
    return roundTenge(base * rule.rate * periodMultiplier);
  }

  let base: number;
  if (rule.fixedBaseMzp !== undefined) {
    base = rule.fixedBaseMzp * rules.mzp;
  } else {
    base = calcBase(monthlyIncome, rule.minBaseMzp, rule.maxBaseMzp, rules.mzp);
  }

  return roundTenge(base * rule.rate * periodMultiplier);
}

export function calculateSocialContributions(input: SocialCalcInput): {
  lineItems: PaymentLineItem[];
  total: number;
} {
  const {
    monthlyIncome,
    monthlyEmployeePayroll,
    hasEmployees,
    benefits,
    rules,
    periodMultiplier,
    regimeId,
  } = input;
  const exempted = getExemptedPayments(benefits, rules, regimeId);
  const lineItems: PaymentLineItem[] = [];
  let total = 0;

  for (const rule of rules.socialContributions) {
    if (rule.id === "opvr") {
      if (!hasEmployees) continue;

      const base = calcBase(monthlyEmployeePayroll, rule.minBaseMzp, rule.maxBaseMzp, rules.mzp);
      const monthlyAmount = roundTenge(base * rule.rate);
      const amount = roundTenge(monthlyAmount * periodMultiplier);
      const isExempted = exempted.has(rule.id);

      lineItems.push({
        id: rule.id,
        labelKey: "payment.opvr",
        amount: isExempted ? 0 : amount,
        formula: `${(rule.rate * 100).toFixed(1)}% × ФОТ ${roundTenge(base).toLocaleString("ru-RU")} ₸`,
        category: "social",
        exempted: isExempted,
        exemptionReasonKey: isExempted ? "exemption.benefit" : undefined,
      });

      if (!isExempted) total += amount;
      continue;
    }

    let base: number;
    if (rule.fixedBaseMzp !== undefined) {
      base = rule.fixedBaseMzp * rules.mzp;
    } else {
      base = calcBase(monthlyIncome, rule.minBaseMzp, rule.maxBaseMzp, rules.mzp);
    }

    const monthlyAmount = roundTenge(base * rule.rate);
    const amount = roundTenge(monthlyAmount * periodMultiplier);
    const isExempted = exempted.has(rule.id);

    const formula = rule.fixedBaseMzp
      ? `${(rule.rate * 100).toFixed(1)}% × ${rule.fixedBaseMzp} МЗП`
      : `${(rule.rate * 100).toFixed(1)}% × ${roundTenge(base).toLocaleString("ru-RU")} ₸`;

    lineItems.push({
      id: rule.id,
      labelKey: rule.labelKey,
      amount: isExempted ? 0 : amount,
      formula,
      category: "social",
      exempted: isExempted,
      exemptionReasonKey: isExempted ? "exemption.benefit" : undefined,
    });

    if (!isExempted) total += amount;
  }

  return { lineItems, total };
}

export function calculateFlatSocial(
  grossIncome: number,
  rate: number,
  periodMultiplier: number
): { lineItems: PaymentLineItem[]; total: number } {
  const amount = roundTenge(grossIncome * rate);
  const perPayment = roundTenge((grossIncome / periodMultiplier) * rate);

  return {
    total: amount,
    lineItems: [
      {
        id: "flat_social",
        labelKey: "payment.flat_social",
        amount,
        formula: `${(rate * 100).toFixed(0)}% × ${perPayment.toLocaleString("ru-RU")} ₸/мес`,
        category: "social",
      },
    ],
  };
}

export function getOpvDeductionAmount(
  monthlyIncome: number,
  rules: TaxRuleSet,
  benefits: BenefitId[],
  periodMultiplier: number
): number {
  const exempted = getExemptedPayments(benefits, rules, "general");
  if (exempted.has("opv")) return 0;

  const opvRule = rules.socialContributions.find((r) => r.id === "opv");
  if (!opvRule) return 0;

  const base = calcBase(monthlyIncome, opvRule.minBaseMzp, opvRule.maxBaseMzp, rules.mzp);
  return roundTenge(base * opvRule.rate * periodMultiplier);
}
