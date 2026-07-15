import { Decimal } from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

/** Canonical UI / balance money scale (2 decimal places). */
export const MONEY_SCALE = 2;

export function d(value: Decimal.Value): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function money(value: Decimal.Value, scale = MONEY_SCALE): string {
  return d(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export function isPositiveMoney(value: string): boolean {
  try {
    return d(value).gt(0);
  } catch {
    return false;
  }
}

export function isNonNegativeMoney(value: string): boolean {
  try {
    return d(value).gte(0);
  } catch {
    return false;
  }
}

export function sumMoney(values: Iterable<string>, scale = MONEY_SCALE): string {
  let total = d(0);
  for (const v of values) total = total.plus(d(v));
  return money(total, scale);
}

export function absMoney(value: string, scale = MONEY_SCALE): string {
  return money(d(value).abs(), scale);
}

export function negMoney(value: string, scale = MONEY_SCALE): string {
  return money(d(value).neg(), scale);
}

export function cmpMoney(a: string, b: string): number {
  return d(a).comparedTo(d(b));
}

export function eqMoney(a: string, b: string): boolean {
  return d(a).eq(d(b));
}

export function zeroMoney(scale = MONEY_SCALE): string {
  return money(0, scale);
}

/**
 * Largest Remainder Method: allocate `total` across `weights` so each share
 * is at `scale` decimals and the sum equals `total` exactly.
 */
export function allocateLargestRemainder(
  total: Decimal.Value,
  weights: ReadonlyArray<Decimal.Value>,
  scale = MONEY_SCALE,
): string[] {
  const n = weights.length;
  if (n === 0) return [];

  const totalD = d(total);
  if (totalD.lt(0)) throw new Error("negative_total");

  const weightDs = weights.map((w) => d(w));
  const weightSum = weightDs.reduce((acc, w) => acc.plus(w), d(0));
  if (weightSum.lte(0)) throw new Error("invalid_weights");

  const unit = d(10).pow(-scale);
  const exact = weightDs.map((w) => totalD.mul(w).div(weightSum));
  const floors = exact.map((x) => x.toDecimalPlaces(scale, Decimal.ROUND_FLOOR));
  const allocated = floors.reduce((acc, x) => acc.plus(x), d(0));
  let remainUnits = totalD.minus(allocated).div(unit).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  const remainders = exact.map((x, i) => ({
    i,
    frac: x.minus(floors[i]!),
  }));
  remainders.sort((a, b) => {
    const c = b.frac.comparedTo(a.frac);
    if (c !== 0) return c;
    return a.i - b.i;
  });

  const result = floors.map((x) => x);
  let idx = 0;
  while (remainUnits > 0 && n > 0) {
    const target = remainders[idx % n]!.i;
    result[target] = result[target]!.plus(unit);
    remainUnits -= 1;
    idx += 1;
  }

  return result.map((x) => money(x, scale));
}
