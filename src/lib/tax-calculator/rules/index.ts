import type { TaxRuleSet } from "./schema";
import { RULES_2025 } from "./years/2025";
import { RULES_2026 } from "./years/2026";

export { REGIONS, getRegionRate } from "./regions";
export { BENEFIT_RULES } from "./benefits";
export { REGIME_CONDITIONS } from "./regime-conditions";
export { SELF_EMPLOYED_OKED, SELF_EMPLOYED_OKED_SOURCE_URL } from "./self-employed-oked";
export type { TaxRuleSet, BenefitRule, RegimeRules, RegionRate } from "./schema";

const RULES_BY_YEAR: Record<number, TaxRuleSet> = {
  2025: RULES_2025,
  2026: RULES_2026,
};

export const AVAILABLE_YEARS = Object.keys(RULES_BY_YEAR)
  .map(Number)
  .sort((a, b) => b - a);

export function getRules(year: number): TaxRuleSet {
  return RULES_BY_YEAR[year] ?? RULES_2026;
}
