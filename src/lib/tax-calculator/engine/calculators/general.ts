import type { TaxRuleSet } from "../../rules/schema";
import type { TaxInput, TaxResult } from "../../types";
import { roundTenge } from "../../format";
import { calculateIpnDeductions, collectAppliedBenefits } from "../deductions";
import { calcGeneralExpenseDeduction, normalizeExpenseInputs } from "../expense-deductions";
import { checkEligibility } from "../eligibility";
import { calculateSocialContributions, getOpvDeductionAmount } from "../social-contributions";
import { annualToDisplay, calcProgressiveTax, effectiveRate, scaleAnnualItemsToPeriod, toPeriodAmounts } from "../utils";

function emptyResult(
  input: TaxInput,
  grossIncome: number,
  warnings: TaxResult["warnings"],
  reasonKey?: string
): TaxResult {
  return {
    regime: "general",
    grossIncome,
    period: input.period,
    totalTaxes: 0,
    totalSocial: 0,
    totalPayments: 0,
    netIncome: 0,
    effectiveRate: 0,
    lineItems: [],
    deductions: [],
    appliedBenefits: [],
    warnings,
    isEligible: false,
    ineligibilityReasonKey: reasonKey,
  };
}

export function calculateGeneral(input: TaxInput, rules: TaxRuleSet): TaxResult {
  const { isEligible, reasonKey, warnings: eligibilityWarnings } = checkEligibility(
    input,
    "general",
    rules
  );
  const { monthly, annual } = toPeriodAmounts(input.income, input.period);
  const periodMultiplier = input.period === "monthly" ? 1 : 12;
  const grossIncome = input.period === "monthly" ? monthly : annual;
  const monthlyEmployeePayroll = input.hasEmployees
    ? toPeriodAmounts(input.employeePayroll ?? 0, input.period).monthly
    : 0;

  if (!isEligible) {
    return emptyResult(input, grossIncome, eligibilityWarnings, reasonKey);
  }

  const { annualBusinessExpenses } = normalizeExpenseInputs(input);
  const expenseResult = calcGeneralExpenseDeduction(annual, annualBusinessExpenses, rules);

  const warnings = [...eligibilityWarnings, ...expenseResult.warnings];
  const deductionsRaw = expenseResult.deduction ? [expenseResult.deduction] : [];

  const regime = rules.regimes.general;
  const brackets = regime.incomeTaxBrackets ?? rules.ipnBrackets;

  let taxableAnnual = expenseResult.taxableIncome;
  const ipnDeductions: { labelKey: string; amount: number }[] = [];

  if (expenseResult.deduction) {
    ipnDeductions.push({
      labelKey: expenseResult.deduction.labelKey,
      amount: expenseResult.deduction.amount,
    });
  }

  if (regime.usesBasicIpnDeduction) {
    const basicDeduction = roundTenge((regime.basicIpnDeductionMrp ?? rules.basicIpnDeductionMrp) * rules.mrp * 12);
    const applied = Math.min(basicDeduction, taxableAnnual);
    taxableAnnual -= applied;
    if (applied > 0) {
      ipnDeductions.push({ labelKey: "deduction.basic", amount: applied });
    }
  }

  const opvDeduction = getOpvDeductionAmount(monthly, rules, input.benefits, 12);
  if (opvDeduction > 0) {
    taxableAnnual -= opvDeduction;
    ipnDeductions.push({ labelKey: "deduction.opv", amount: opvDeduction });
  }

  const { total: benefitDeductionTotal, applied: benefitDeductions } = calculateIpnDeductions(
    input.benefits,
    rules,
    "general",
    12,
    input.disabledChildrenCount ?? 1
  );

  if (benefitDeductionTotal > 0) {
    taxableAnnual -= benefitDeductionTotal;
  }

  taxableAnnual = Math.max(0, taxableAnnual);
  const ipnAnnual = calcProgressiveTax(taxableAnnual, brackets, rules.mrp);

  const social = calculateSocialContributions({
    monthlyIncome: monthly,
    monthlyEmployeePayroll,
    hasEmployees: input.hasEmployees,
    benefits: input.benefits,
    rules,
    periodMultiplier,
    regimeId: "general",
  });

  const expensesDisplay = annualToDisplay(annualBusinessExpenses, input.period);
  const totalTaxes = annualToDisplay(ipnAnnual, input.period);
  const totalSocial = social.total;
  const totalPayments = totalTaxes + totalSocial;
  const totalOutflow = totalPayments + expensesDisplay;
  const netIncome = Math.max(0, grossIncome - totalOutflow);

  const deductions = scaleAnnualItemsToPeriod(deductionsRaw, input.period);

  const lineItems = [
    ...(expenseResult.deduction
      ? [
          {
            id: "business_expenses",
            labelKey: "deduction.business_expenses",
            amount: expensesDisplay,
            formula: expenseResult.deduction.formula ?? "",
            category: "deduction" as const,
          },
        ]
      : []),
    {
      id: "ipn",
      labelKey: "payment.ipn",
      amount: totalTaxes,
      formula:
        ipnDeductions.length > 0
          ? `База ${roundTenge(expenseResult.taxableIncome).toLocaleString("ru-RU")} ₸/год, вычеты применены`
          : "Прогрессивная шкала 10% / 15%",
      category: "tax" as const,
    },
    ...social.lineItems,
  ];

  const taxableIncome = annualToDisplay(taxableAnnual, input.period);

  return {
    regime: "general",
    grossIncome,
    period: input.period,
    taxableIncome,
    totalTaxes,
    totalSocial,
    totalPayments,
    netIncome,
    effectiveRate: effectiveRate(totalOutflow, grossIncome),
    lineItems,
    deductions,
    appliedBenefits: collectAppliedBenefits({
      benefits: input.benefits,
      rules,
      regimeId: "general",
      period: input.period,
      monthlyIncome: monthly,
      monthlyEmployeePayroll,
      hasEmployees: input.hasEmployees,
      periodMultiplier,
      disabledChildrenCount: input.disabledChildrenCount ?? 1,
    }),
    warnings,
    isEligible: true,
  };
}
