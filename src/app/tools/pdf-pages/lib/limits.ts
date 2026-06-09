export const PLAN_LIMITS = {
  free: {
    maxPages: Infinity,
    maxFileSizeMb: Infinity,
    maxFiles: Infinity,
  },
  pro: {
    maxPages: Infinity,
    maxFileSizeMb: Infinity,
    maxFiles: Infinity,
  },
} as const;

export const currentPlan: keyof typeof PLAN_LIMITS = "free";
