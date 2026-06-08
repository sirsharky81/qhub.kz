import type { BenefitId, RegimeId, SocialPaymentId } from "../types";

export interface LocalizedLabel {
  ru: string;
  kk: string;
  en: string;
}

export interface TaxBracket {
  upToMrp: number | null;
  rate: number;
}

export interface SocialContributionRule {
  id: SocialPaymentId;
  rate: number;
  minBaseMzp: number;
  maxBaseMzp: number | null;
  fixedBaseMzp?: number;
  labelKey: string;
}

export interface BenefitDeduction {
  type: "fixed_mrp_annual" | "fixed_mrp_monthly";
  amountMrp: number;
  perChild?: boolean;
}

export interface BenefitRule {
  id: BenefitId;
  labelKey: string;
  descriptionKey: string;
  applicableRegimes: RegimeId[];
  exemptions: SocialPaymentId[];
  ipnDeduction?: BenefitDeduction;
  mutualExclusive?: BenefitId[];
}

export interface RegimeRules {
  id: RegimeId;
  labelKey: string;
  descriptionKey: string;
  requiresIpRegistration: boolean;
  allowsEmployees: boolean;
  annualIncomeLimitMrp?: number;
  monthlyIncomeLimitMrp?: number;
  incomeTaxRate?: number;
  incomeTaxUsesRegionalRate?: boolean;
  flatSocialRate?: number;
  incomeTaxBrackets?: TaxBracket[];
  usesProgressiveIpn?: boolean;
  usesBasicIpnDeduction?: boolean;
  basicIpnDeductionMrp?: number;
  /** Порог годового дохода (МРП) для вычета ФОТ на упрощёнке. null = не применяется */
  payrollDeductionThresholdMrp?: number | null;
  /** Разрешён вычет подтверждённых расходов (ОУР) */
  allowsBusinessExpenseDeduction?: boolean;
}

export interface RegionRate {
  id: string;
  labelKey: string;
  simplifiedRate: number;
}

export interface TaxRuleSet {
  year: number;
  effectiveFrom: string;
  mrp: number;
  mzp: number;
  vat: { rate: number; thresholdMrp: number };
  regimes: Record<RegimeId, RegimeRules>;
  socialContributions: SocialContributionRule[];
  benefits: BenefitRule[];
  ipnBrackets: TaxBracket[];
  basicIpnDeductionMrp: number;
  paymentDeadlines: { day: number; descriptionKey: string };
  disclaimerKey: string;
  lastUpdated: string;
}
