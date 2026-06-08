import { getRules } from "./rules";
import { REGIONS } from "./rules/regions";
import { calculateAllRegimes, calculateRegime, findBestRegime } from "./engine";
import { parseAmountInput } from "./format";
import { t } from "./i18n";
import type {
  BenefitId,
  CalculationOutput,
  Lang,
  Period,
  RegimeId,
  RegimeSelection,
  TaxInput,
} from "./types";

export interface FormValues {
  income: string;
  period: Period;
  year: string;
  regionId: string;
  regime: RegimeSelection;
  benefits: BenefitId[];
  disabledChildrenCount: string;
  businessExpenses: string;
  payrollExpenses: string;
  hasEmployees: boolean;
  employeePayroll: string;
}

export const DEFAULT_VALUES: FormValues = {
  income: "500 000",
  period: "monthly",
  year: "2026",
  regionId: "almaty_city",
  regime: "compare_all",
  benefits: [],
  disabledChildrenCount: "1",
  businessExpenses: "0",
  payrollExpenses: "0",
  hasEmployees: false,
  employeePayroll: "0",
};

const VALID_REGIMES: RegimeSelection[] = [
  "compare_all",
  "simplified",
  "general",
  "self_employed",
  "kfh",
];

const VALID_BENEFITS: BenefitId[] = [
  "pensioner",
  "disability_1_2",
  "disability_3",
  "parent_disabled_child",
  "ww2_veteran",
];

export function validateInputs(
  values: FormValues,
  lang: Lang
): { input: TaxInput } | { error: string } {
  const income = parseAmountInput(values.income);
  if (!Number.isFinite(income) || income < 0) {
    return { error: t(lang, "err.income") };
  }

  const year = parseInt(values.year, 10);
  if (!Number.isFinite(year) || year < 2025 || year > 2026) {
    return { error: t(lang, "err.year") };
  }

  if (!REGIONS.some((r) => r.id === values.regionId)) {
    return { error: t(lang, "err.region") };
  }

  if (!VALID_REGIMES.includes(values.regime)) {
    return { error: t(lang, "err.regime") };
  }

  const benefits = values.benefits.filter((b) => VALID_BENEFITS.includes(b));

  const childCount = parseInt(values.disabledChildrenCount, 10);
  const disabledChildrenCount =
    benefits.includes("parent_disabled_child") && Number.isFinite(childCount) && childCount > 0
      ? childCount
      : 1;

  const businessExpenses = parseAmountInput(values.businessExpenses);
  const payrollExpenses = parseAmountInput(values.payrollExpenses);

  if (!Number.isFinite(businessExpenses) || businessExpenses < 0) {
    return { error: t(lang, "err.expenses") };
  }
  if (!Number.isFinite(payrollExpenses) || payrollExpenses < 0) {
    return { error: t(lang, "err.payroll") };
  }

  const employeePayroll = parseAmountInput(values.employeePayroll);
  if (!Number.isFinite(employeePayroll) || employeePayroll < 0) {
    return { error: t(lang, "err.employee_payroll") };
  }

  if (values.hasEmployees && employeePayroll <= 0) {
    return { error: t(lang, "err.employee_payroll_required") };
  }

  return {
    input: {
      income,
      period: values.period,
      year,
      regionId: values.regionId,
      regime: values.regime,
      benefits,
      disabledChildrenCount,
      businessExpenses: businessExpenses > 0 ? businessExpenses : undefined,
      payrollExpenses: payrollExpenses > 0 ? payrollExpenses : undefined,
      hasEmployees: values.hasEmployees,
      employeePayroll: values.hasEmployees && employeePayroll > 0 ? employeePayroll : undefined,
    },
  };
}

export function runCalculation(input: TaxInput): CalculationOutput {
  const rules = getRules(input.year);

  let results: ReturnType<typeof calculateAllRegimes>;
  if (input.regime === "compare_all") {
    results = calculateAllRegimes(input, rules);
  } else {
    results = [calculateRegime(input, input.regime as RegimeId, rules)];
  }

  const eligible = results.filter((r) => r.isEligible);
  const bestRegime = findBestRegime(results);
  const primary =
    input.regime === "compare_all"
      ? eligible.find((r) => r.regime === bestRegime) ?? eligible[0] ?? null
      : results[0] ?? null;

  return {
    input,
    results,
    primary,
    bestRegime,
    rulesYear: rules.year,
    lastUpdated: rules.lastUpdated,
  };
}
