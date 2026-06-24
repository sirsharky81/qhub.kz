export const FAMILY_MEMBER_TYPES = [
  "child",
  "elderly_parent",
  "dependent",
  "husband",
  "wife",
] as const;

export type FamilyMemberType = (typeof FAMILY_MEMBER_TYPES)[number];

export const MEMBER_TYPE_LABELS: Record<FamilyMemberType, string> = {
  child: "Ребёнок",
  elderly_parent: "Пожилой родитель",
  dependent: "Подопечный",
  husband: "Муж",
  wife: "Жена",
};

export function isFamilyMemberType(value: string): value is FamilyMemberType {
  return (FAMILY_MEMBER_TYPES as readonly string[]).includes(value);
}

export function normalizeMemberType(value?: string): FamilyMemberType {
  if (value && isFamilyMemberType(value)) return value;
  return "child";
}
