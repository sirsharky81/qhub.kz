export type Lang = "ru" | "kk" | "en";

export type DayBasisType = "act360" | "act365_366" | "d30_360";

export interface DayBasis {
  type: DayBasisType;
  basis: number;
}

export type CommissionType = "sum" | "pct";

export type RepaymentMethod = "annuity" | "differentiated";

export interface RegulatoryMeta {
  borrowerName: string;
  borrowerId: string;
  contractNumber: string;
  contractDate: string;
  scheduleDate: string;
  repaymentMethod: RepaymentMethod;
}

export interface LoanInput {
  principal: number;
  rate: number;
  months: number;
  disbursement: Date;
  dayBasis: DayBasis;
  gracePeriods: number;
  graceMonths: number;
  freq: 1 | 3;
  commissionAmt: number;
  commissionVal: number;
  commissionType: CommissionType;
  netPrincipal: number;
}

export interface ScheduleRow {
  month: number;
  date: Date;
  days: number;
  payment: number;
  principal: number;
  interest: number;
  deferred: number;
  balance: number;
  isGrace: boolean;
  isDisbursement?: boolean;
  periodIndex?: number;
}

export interface ScheduleTotals {
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
}

export interface AnnuityResult {
  rows: ScheduleRow[];
  payment: number;
  totalPaid: number;
  deferredTotal: number;
  totals: ScheduleTotals;
}

export interface DiffResult {
  rows: ScheduleRow[];
  firstPayment: number;
  lastPayment: number;
  totalPaid: number;
  deferredTotal: number;
  totals: ScheduleTotals;
}

export interface CalculationResult {
  input: LoanInput;
  annuity: AnnuityResult;
  diff: DiffResult;
  annuityEIR: number | null;
  diffEIR: number | null;
}

export type TabId = "annuity-table" | "diff-table" | "breakdown";

export type ChartView = "both" | "single";
export type ChartType = "annuity" | "diff";
