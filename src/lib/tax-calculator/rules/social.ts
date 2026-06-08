import type { SocialContributionRule } from "./schema";

export const SOCIAL_CONTRIBUTIONS: SocialContributionRule[] = [
  {
    id: "opv",
    rate: 0.1,
    minBaseMzp: 1,
    maxBaseMzp: 50,
    labelKey: "payment.opv",
  },
  {
    id: "vosms",
    rate: 0.05,
    minBaseMzp: 0,
    maxBaseMzp: null,
    fixedBaseMzp: 1.4,
    labelKey: "payment.vosms",
  },
  {
    id: "opvr",
    rate: 0.035,
    minBaseMzp: 1,
    maxBaseMzp: 50,
    labelKey: "payment.opvr",
  },
  {
    id: "so",
    rate: 0.05,
    minBaseMzp: 1,
    maxBaseMzp: 7,
    labelKey: "payment.so",
  },
];
