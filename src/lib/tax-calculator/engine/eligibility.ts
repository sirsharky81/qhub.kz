import type { TaxRuleSet } from "../rules/schema";
import type { RegimeId, TaxInput, TaxWarning } from "../types";
import { toPeriodAmounts } from "./utils";

export function checkEligibility(
  input: TaxInput,
  regimeId: RegimeId,
  rules: TaxRuleSet
): { isEligible: boolean; reasonKey?: string; warnings: TaxWarning[] } {
  const regime = rules.regimes[regimeId];
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const warnings: TaxWarning[] = [];

  if (regime.annualIncomeLimitMrp) {
    const limit = regime.annualIncomeLimitMrp * rules.mrp;
    if (annual > limit) {
      return {
        isEligible: false,
        reasonKey: "ineligible.annual_limit",
        warnings,
      };
    }
    if (annual > limit * 0.9) {
      warnings.push({ id: "near_annual_limit", messageKey: "warning.near_annual_limit", severity: "warning" });
    }
  }

  if (regime.monthlyIncomeLimitMrp) {
    const limit = regime.monthlyIncomeLimitMrp * rules.mrp;
    if (monthly > limit) {
      return {
        isEligible: false,
        reasonKey: "ineligible.monthly_limit",
        warnings,
      };
    }
    if (monthly > limit * 0.9) {
      warnings.push({ id: "near_monthly_limit", messageKey: "warning.near_monthly_limit", severity: "warning" });
    }
  }

  if (regimeId === "general" && annual > rules.vat.thresholdMrp * rules.mrp) {
    warnings.push({ id: "vat_threshold", messageKey: "warning.vat_threshold", severity: "info" });
  }

  if (regimeId === "self_employed") {
    warnings.push({ id: "not_ip", messageKey: "warning.self_employed_not_ip", severity: "info" });
  }

  return { isEligible: true, warnings };
}
