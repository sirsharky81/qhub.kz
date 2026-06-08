import type { BenefitRule } from "./schema";

export const BENEFIT_RULES: BenefitRule[] = [
  {
    id: "pensioner",
    labelKey: "benefit.pensioner",
    descriptionKey: "benefit.pensioner.desc",
    applicableRegimes: ["simplified", "general", "kfh"],
    exemptions: ["opv", "vosms", "so"],
    mutualExclusive: [],
  },
  {
    id: "disability_1_2",
    labelKey: "benefit.disability_1_2",
    descriptionKey: "benefit.disability_1_2.desc",
    applicableRegimes: ["simplified", "general", "kfh"],
    exemptions: ["opv", "vosms", "so", "opvr"],
    ipnDeduction: { type: "fixed_mrp_annual", amountMrp: 5000 },
    mutualExclusive: ["disability_3"],
  },
  {
    id: "disability_3",
    labelKey: "benefit.disability_3",
    descriptionKey: "benefit.disability_3.desc",
    applicableRegimes: ["simplified", "general", "kfh"],
    exemptions: [],
    ipnDeduction: { type: "fixed_mrp_annual", amountMrp: 882 },
    mutualExclusive: ["disability_1_2"],
  },
  {
    id: "parent_disabled_child",
    labelKey: "benefit.parent_disabled_child",
    descriptionKey: "benefit.parent_disabled_child.desc",
    applicableRegimes: ["simplified", "general", "kfh"],
    exemptions: [],
    ipnDeduction: { type: "fixed_mrp_annual", amountMrp: 882, perChild: true },
    mutualExclusive: [],
  },
  {
    id: "ww2_veteran",
    labelKey: "benefit.ww2_veteran",
    descriptionKey: "benefit.ww2_veteran.desc",
    applicableRegimes: ["simplified", "general", "kfh"],
    exemptions: [],
    ipnDeduction: { type: "fixed_mrp_annual", amountMrp: 882 },
    mutualExclusive: [],
  },
];
