import type { TaxRuleSet } from "../schema";
import { BENEFIT_RULES } from "../benefits";
import { SOCIAL_CONTRIBUTIONS } from "../social";

export const RULES_2025: TaxRuleSet = {
  year: 2025,
  effectiveFrom: "2025-01-01",
  mrp: 3932,
  mzp: 85000,
  vat: { rate: 0.16, thresholdMrp: 20000 },
  basicIpnDeductionMrp: 14,
  ipnBrackets: [
    { upToMrp: 230000, rate: 0.1 },
    { upToMrp: null, rate: 0.15 },
  ],
  socialContributions: SOCIAL_CONTRIBUTIONS,
  benefits: BENEFIT_RULES,
  paymentDeadlines: { day: 25, descriptionKey: "deadline.monthly" },
  disclaimerKey: "disclaimer.text",
  lastUpdated: "2025-06-01",
  regimes: {
    simplified: {
      id: "simplified",
      labelKey: "regime.simplified",
      descriptionKey: "regime.simplified.desc",
      requiresIpRegistration: true,
      allowsEmployees: true,
      annualIncomeLimitMrp: 600000,
      incomeTaxRate: 0.04,
      incomeTaxUsesRegionalRate: true,
      payrollDeductionThresholdMrp: null,
    },
    general: {
      id: "general",
      labelKey: "regime.general",
      descriptionKey: "regime.general.desc",
      requiresIpRegistration: true,
      allowsEmployees: true,
      usesProgressiveIpn: true,
      usesBasicIpnDeduction: true,
      basicIpnDeductionMrp: 14,
      allowsBusinessExpenseDeduction: true,
      incomeTaxBrackets: [
        { upToMrp: 230000, rate: 0.1 },
        { upToMrp: null, rate: 0.15 },
      ],
    },
    self_employed: {
      id: "self_employed",
      labelKey: "regime.self_employed",
      descriptionKey: "regime.self_employed.desc",
      requiresIpRegistration: false,
      allowsEmployees: false,
      monthlyIncomeLimitMrp: 300,
      flatSocialRate: 0.04,
    },
    kfh: {
      id: "kfh",
      labelKey: "regime.kfh",
      descriptionKey: "regime.kfh.desc",
      requiresIpRegistration: true,
      allowsEmployees: true,
      incomeTaxRate: 0.03,
    },
  },
};
