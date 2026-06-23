/** Client-safe phone helpers (no heavy qr-generator imports). */

export function normalizeKzPhone(input: string): string {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+7")) return `+7${cleaned.slice(2).replace(/\D/g, "").slice(0, 10)}`;
  if (cleaned.startsWith("8") && cleaned.length >= 11) {
    return `+7${cleaned.slice(1).replace(/\D/g, "").slice(0, 10)}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (cleaned.startsWith("+")) return cleaned;
  return `+${digits}`;
}

/** e.g. +77071234567 → +7707XXXX567 */
export function maskPhone(phone: string): string {
  const n = normalizeKzPhone(phone);
  const m = n.match(/^\+7(\d{10})$/);
  if (!m) return n;
  const digits = m[1];
  return `+7${digits.slice(0, 3)}XXXX${digits.slice(-3)}`;
}
