export function formatMoney(n: number): string {
  return new Intl.NumberFormat("kk-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseAmountInput(value: string): number {
  const digits = String(value).replace(/\D/g, "");
  return digits === "" ? NaN : Number(digits);
}

export function formatAmountInput(value: string | number): string {
  const n = typeof value === "number" ? value : parseAmountInput(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)
    : "";
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function parseRateInput(value: string): number {
  const s = String(value).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function formatRateField(value: string): string {
  const n = parseRateInput(value);
  if (!Number.isFinite(n)) return value;
  return n % 1 === 0 ? String(n) : String(Math.round(n * 10000) / 10000);
}

export function formatShort(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

export function formatNum(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}
