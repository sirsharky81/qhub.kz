import { formatMoney2 } from "@/lib/credit-calculator/format";

export function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** КГД иногда отдаёт задолженность со знаком минус. */
export function debtAmount(value: unknown): number {
  return Math.abs(parseAmount(value));
}

export function formatTenge(value: number): string {
  return formatMoney2(value);
}

export function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function formatReportDate(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return raw;
}
