export function normalizeSosPhone(input: string): string {
  return input.trim().replace(/[^\d+]/g, "");
}

export function isValidSosPhone(phone: string): boolean {
  const n = normalizeSosPhone(phone);
  return n.length >= 10 && n.length <= 15;
}
