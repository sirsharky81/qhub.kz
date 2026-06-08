import type { RegimeId } from "../types";

export interface RegimeConditionLink {
  href: string;
  labelKey: string;
}

export interface RegimeConditionDef {
  key: string;
  highlight?: boolean;
  link?: RegimeConditionLink;
}

export const REGIME_CONDITIONS: Record<RegimeId, RegimeConditionDef[]> = {
  simplified: [
    { key: "condition.simplified.ip", highlight: true },
    { key: "condition.simplified.income_limit", highlight: true },
    { key: "condition.simplified.tax_on_income" },
    { key: "condition.simplified.social" },
    { key: "condition.simplified.payroll_deduction", highlight: true },
    { key: "condition.simplified.no_vat" },
  ],
  general: [
    { key: "condition.general.ip", highlight: true },
    { key: "condition.general.expenses", highlight: true },
    { key: "condition.general.progressive_ipn" },
    { key: "condition.general.accounting" },
    { key: "condition.general.vat_threshold", highlight: true },
    { key: "condition.general.social" },
  ],
  self_employed: [
    { key: "condition.self_employed.no_ip", highlight: true },
    { key: "condition.self_employed.no_employees", highlight: true },
    { key: "condition.self_employed.income_limit", highlight: true },
    {
      key: "condition.self_employed.oked_list",
      link: {
        href: "/apps/tax-calculator/oked",
        labelKey: "condition.self_employed.oked_list.link",
      },
    },
    { key: "condition.self_employed.social_only" },
    { key: "condition.self_employed.no_expenses" },
  ],
  kfh: [
    { key: "condition.kfh.registration", highlight: true },
    { key: "condition.kfh.agricultural", highlight: true },
    { key: "condition.kfh.tax_rate" },
    { key: "condition.kfh.social" },
    { key: "condition.kfh.employees" },
  ],
};
