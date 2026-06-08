export type Lang = "ru" | "kk" | "en";

export type RegimeId = "simplified" | "general" | "self_employed" | "kfh";

export type BenefitId =
  | "pensioner"
  | "disability_1_2"
  | "disability_3"
  | "parent_disabled_child"
  | "ww2_veteran";

export type Period = "monthly" | "annual";

export type RegimeSelection = RegimeId | "compare_all";

export type SocialPaymentId = "opv" | "vosms" | "so" | "opvr";

export interface TaxInput {
  income: number;
  period: Period;
  year: number;
  regionId: string;
  regime: RegimeSelection;
  benefits: BenefitId[];
  disabledChildrenCount?: number;
  /** Подтверждённые расходы для вычета на ОУР (в том же периоде, что и доход) */
  businessExpenses?: number;
  /** Расходы на оплату труда (gross, начисленный ФОТ) для вычета на упрощёнке */
  payrollExpenses?: number;
  /** Используется наёмный труд работников */
  hasEmployees: boolean;
  /** Начисленная зарплата работников gross (до ОПВ/ИПН/ВОСМС) — база для ОПВР */
  employeePayroll?: number;
}

export interface PaymentLineItem {
  id: string;
  labelKey: string;
  amount: number;
  formula: string;
  category: "tax" | "social" | "deduction";
  exempted?: boolean;
  exemptionReasonKey?: string;
}

export interface AppliedBenefit {
  id: BenefitId;
  labelKey: string;
  savings: number;
  descriptionKey: string;
}

export interface TaxWarning {
  id: string;
  messageKey: string;
  severity: "info" | "warning";
}

export interface TaxDeduction {
  labelKey: string;
  amount: number;
  formula?: string;
}

export interface TaxResult {
  regime: RegimeId;
  grossIncome: number;
  period: Period;
  taxableIncome?: number;
  totalTaxes: number;
  totalSocial: number;
  totalPayments: number;
  netIncome: number;
  effectiveRate: number;
  lineItems: PaymentLineItem[];
  deductions: TaxDeduction[];
  appliedBenefits: AppliedBenefit[];
  warnings: TaxWarning[];
  isEligible: boolean;
  ineligibilityReasonKey?: string;
}

export interface CalculationOutput {
  input: TaxInput;
  results: TaxResult[];
  primary: TaxResult | null;
  bestRegime: RegimeId | null;
  rulesYear: number;
  lastUpdated: string;
}

export type TabId = "summary" | "breakdown" | "benefits" | "comparison";
