import type { TaxRuleSet } from "../rules/schema";
import type { Period } from "../types";
import { roundTenge } from "../format";
import { calcProgressiveTax, toPeriodAmounts } from "./utils";

/** Стандартный налоговый вычет работника по ИПН, МРП/мес */
const EMPLOYEE_IPN_STANDARD_DEDUCTION_MRP = 14;

const EMPLOYEE_OPV = { rate: 0.1, minBaseMzp: 1, maxBaseMzp: 50 };
const EMPLOYEE_VOSMS_RATE = 0.02;

function employeeOpvBase(monthlyGross: number, mzp: number): number {
  const min = EMPLOYEE_OPV.minBaseMzp * mzp;
  const max = EMPLOYEE_OPV.maxBaseMzp * mzp;
  return Math.min(Math.max(monthlyGross, min), max);
}

export interface EmployeeNetPayResult {
  gross: number;
  net: number;
  opv: number;
  vosms: number;
  ipn: number;
}

/** Оценка суммы «на руки» с начисленного gross ФОТ (удержания с работника) */
export function calculateEmployeeNetPay(
  grossAmount: number,
  period: Period,
  rules: TaxRuleSet
): EmployeeNetPayResult | null {
  if (grossAmount <= 0) return null;

  const { monthly } = toPeriodAmounts(grossAmount, period);
  const opvMonthly = roundTenge(employeeOpvBase(monthly, rules.mzp) * EMPLOYEE_OPV.rate);
  const vosmsMonthly = roundTenge(monthly * EMPLOYEE_VOSMS_RATE);

  const ipnTaxableAnnual = Math.max(
    0,
    (monthly - opvMonthly - EMPLOYEE_IPN_STANDARD_DEDUCTION_MRP * rules.mrp) * 12
  );
  const ipnAnnual = calcProgressiveTax(ipnTaxableAnnual, rules.ipnBrackets, rules.mrp);
  const ipnMonthly = roundTenge(ipnAnnual / 12);

  const netMonthly = roundTenge(monthly - opvMonthly - vosmsMonthly - ipnMonthly);
  const multiplier = period === "monthly" ? 1 : 12;

  return {
    gross: grossAmount,
    net: roundTenge(netMonthly * multiplier),
    opv: roundTenge(opvMonthly * multiplier),
    vosms: roundTenge(vosmsMonthly * multiplier),
    ipn: roundTenge(ipnMonthly * multiplier),
  };
}
