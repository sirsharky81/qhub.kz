export type Lang = "ru" | "kk" | "en";

export interface BccArrear {
  bcc: string;
  bccName: string;
  taxArrear: number;
  poenaArrear: number;
  fineArrear: number;
  percentArrear: number;
  totalArrear: number;
}

export interface TaxpayerArrears {
  taxArrear: number;
  poenaArrear: number;
  percentArrear: number;
  fineArrear: number;
  totalArrear: number;
}

export interface TaxOrgDebt {
  charCode: string;
  name: string;
  reportDate: string | null;
  totalArrear: number;
  totalTaxArrear: number;
  pensionContributionArrear: number;
  socialContributionArrear: number;
  socialHealthInsuranceArrear: number;
  taxpayerName: string;
  taxpayerCode: string;
  taxpayerArrears: TaxpayerArrears;
  bccArrears: BccArrear[];
}

export interface TaxDebtResult {
  taxpayerCode: string;
  taxpayerName: string;
  asOf: string;
  hasDebt: boolean;
  totalArrear: number;
  totalTaxArrear: number;
  pensionContributionArrear: number;
  socialContributionArrear: number;
  socialHealthInsuranceArrear: number;
  taxOrgs: TaxOrgDebt[];
}

export interface TaxDebtLookupResponse {
  result: TaxDebtResult;
}

export interface TaxDebtLookupError {
  error: string;
  code?:
    | "invalid_code"
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "not_configured"
    | "rate_limited"
    | "captcha"
    | "upstream";
}
