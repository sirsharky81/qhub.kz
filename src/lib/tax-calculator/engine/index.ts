import type { TaxRuleSet } from "../rules/schema";
import type { RegimeId, TaxInput, TaxResult } from "../types";
import { resolveBenefitConflicts } from "./deductions";
import { calculateGeneral } from "./calculators/general";
import { calculateKfh } from "./calculators/kfh";
import { calculateSelfEmployed } from "./calculators/self-employed";
import { calculateSimplified } from "./calculators/simplified";

const CALCULATORS: Record<RegimeId, (input: TaxInput, rules: TaxRuleSet) => TaxResult> = {
  simplified: calculateSimplified,
  general: calculateGeneral,
  self_employed: calculateSelfEmployed,
  kfh: calculateKfh,
};

const ALL_REGIMES: RegimeId[] = ["simplified", "general", "self_employed", "kfh"];

export function calculateRegime(
  input: TaxInput,
  regimeId: RegimeId,
  rules: TaxRuleSet
): TaxResult {
  const normalizedInput: TaxInput = {
    ...input,
    benefits: resolveBenefitConflicts(input.benefits, rules),
  };
  return CALCULATORS[regimeId](normalizedInput, rules);
}

export function calculateAllRegimes(input: TaxInput, rules: TaxRuleSet): TaxResult[] {
  return ALL_REGIMES.map((regimeId) => calculateRegime(input, regimeId, rules));
}

export function findBestRegime(results: TaxResult[]): RegimeId | null {
  const eligible = results.filter((r) => r.isEligible);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, current) =>
    current.netIncome > best.netIncome ? current : best
  ).regime;
}
