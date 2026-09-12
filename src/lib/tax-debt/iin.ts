const WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2] as const;

export function normalizeTaxpayerCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export function isTaxpayerCodeLengthValid(code: string): boolean {
  return /^\d{12}$/.test(code);
}

function checksum(digits: number[], weights: readonly number[]): number {
  return digits.slice(0, 11).reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11;
}

/** Контрольная сумма ИИН/БИН РК. */
export function isValidIinBin(code: string): boolean {
  if (!isTaxpayerCodeLengthValid(code)) return false;
  const digits = code.split("").map(Number);
  let control = checksum(digits, WEIGHTS_1);
  if (control === 10) control = checksum(digits, WEIGHTS_2);
  if (control === 10) return false;
  return control === digits[11];
}

export function taxpayerKind(code: string): "iin" | "bin" | null {
  if (!isTaxpayerCodeLengthValid(code)) return null;
  const month = Number(code.slice(2, 4));
  return month >= 1 && month <= 12 ? "iin" : "bin";
}
