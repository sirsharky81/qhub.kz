import type { DayBasis, ScheduleRow, ScheduleTotals } from "./types";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseDayBasis(value: string): DayBasis {
  if (value === "365_366" || value === "365") return { type: "act365_366", basis: 365 };
  if (value === "30_360") return { type: "d30_360", basis: 360 };
  return { type: "act360", basis: 360 };
}

export function dayBasisLabel(db: DayBasis): string {
  if (db.type === "d30_360") return "360/30";
  if (db.type === "act365_366") return "ACT/365-366 (факт/365-366)";
  return "ACT/360 (факт/360)";
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function parseDisbursementDate(iso: string): Date | null {
  if (!iso) return null;
  const parts = String(iso).split("-").map(Number);
  if (parts.length !== 3) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

export function addMonths(date: Date, count: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
}

export function paymentDate(disbDate: Date, periodIdx: number, freq: number): Date {
  return addMonths(disbDate, periodIdx * freq);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function yearBasis(date: Date): 365 | 366 {
  return isLeapYear(date.getFullYear()) ? 366 : 365;
}

export function resolveYearBasis(dayBasis: DayBasis, periodEndDate: Date): number {
  if (dayBasis.type === "act365_366") return yearBasis(periodEndDate);
  return dayBasis.basis;
}

export function daysInPeriod(
  disbDate: Date,
  periodIdx: number,
  freq: number,
  dayBasis: DayBasis
): number {
  if (dayBasis.type === "d30_360") return 30 * freq;
  const start = periodIdx === 1 ? disbDate : addMonths(disbDate, (periodIdx - 1) * freq);
  const end = addMonths(disbDate, periodIdx * freq);
  return daysBetween(start, end);
}

export function calcInterest(
  balance: number,
  annualRatePercent: number,
  days: number,
  dayBasis: DayBasis,
  periodEndDate: Date
): number {
  if (days <= 0 || balance <= 0 || annualRatePercent <= 0) return 0;
  const basis = resolveYearBasis(dayBasis, periodEndDate);
  return round2(balance * (annualRatePercent / 100) * (days / basis));
}

function annuityPaymentClosed(
  principal: number,
  annualRatePercent: number,
  periods: number,
  freq: number
): number {
  if (periods <= 0) return 0;
  if (annualRatePercent <= 0) return round2(principal / periods);
  const periodRate = annualRatePercent / 100 / (12 / freq);
  const factor = Math.pow(1 + periodRate, periods);
  return round2((principal * periodRate * factor) / (factor - 1));
}

function createDisbursementRow(disbDate: Date, principal: number): ScheduleRow {
  return {
    month: 0,
    date: disbDate,
    days: 0,
    payment: 0,
    principal: 0,
    interest: 0,
    deferred: 0,
    balance: round2(principal),
    isGrace: false,
    isDisbursement: true,
    periodIndex: 0,
  };
}

export function computeScheduleTotals(rows: ScheduleRow[]): ScheduleTotals {
  const paymentRows = rows.filter((r) => !r.isGrace);
  return {
    totalPayment: round2(paymentRows.reduce((s, r) => s + r.payment, 0)),
    totalInterest: round2(
      paymentRows.reduce((s, r) => s + Math.max(0, r.interest - (r.deferred || 0)), 0)
    ),
    totalPrincipal: round2(paymentRows.reduce((s, r) => s + r.principal, 0)),
  };
}

/** Строка выдачи — только для регуляторной формы НБ РК */
export function withDisbursementRow(
  rows: ScheduleRow[],
  disbDate: Date,
  principal: number
): ScheduleRow[] {
  return [createDisbursementRow(disbDate, principal), ...rows];
}

export function buildAnnuitySchedule(
  principal: number,
  annualRatePercent: number,
  months: number,
  disbDate: Date,
  dayBasis: DayBasis,
  gracePeriods: number,
  freq: number
): import("./types").AnnuityResult {
  const totalPeriods = Math.floor(months / freq);
  const mainPeriods = totalPeriods - gracePeriods;
  const rows: ScheduleRow[] = [];
  let totalPaid = 0;
  let balance = principal;
  let deferredTotal = 0;

  for (let p = 1; p <= gracePeriods; p++) {
    const endDate = paymentDate(disbDate, p, freq);
    const gDays = daysInPeriod(disbDate, p, freq, dayBasis);
    const gInterest = calcInterest(balance, annualRatePercent, gDays, dayBasis, endDate);
    deferredTotal += gInterest;
    rows.push({
      month: p,
      date: endDate,
      days: gDays,
      payment: 0,
      principal: 0,
      interest: round2(gInterest),
      deferred: 0,
      balance: round2(balance),
      isGrace: true,
      periodIndex: p,
    });
  }

  if (mainPeriods <= 0) {
    return {
      rows,
      payment: 0,
      totalPaid: 0,
      deferredTotal: round2(deferredTotal),
      totals: computeScheduleTotals(rows),
    };
  }

  const deferredInstallment = deferredTotal / mainPeriods;
  const startIdx = gracePeriods + 1;
  const basePayment = annuityPaymentClosed(balance, annualRatePercent, mainPeriods, freq);

  for (let q = 0; q < mainPeriods; q++) {
    const pIdx = startIdx + q;
    const endDate = paymentDate(disbDate, pIdx, freq);
    const days = daysInPeriod(disbDate, pIdx, freq, dayBasis);
    const isLast = q === mainPeriods - 1;
    const interest = calcInterest(balance, annualRatePercent, days, dayBasis, endDate);
    const rowDeferred = round2(deferredInstallment);
    const pureInterest = round2(interest);

    let principalPart: number;
    let rowPayment: number;

    if (isLast) {
      principalPart = round2(balance);
      rowPayment = round2(pureInterest + principalPart + rowDeferred);
    } else {
      principalPart = round2(basePayment - pureInterest);
      if (principalPart < 0) principalPart = 0;
      if (principalPart > balance) principalPart = round2(balance);
      rowPayment = round2(principalPart + pureInterest + rowDeferred);
    }

    balance = round2(Math.max(0, balance - principalPart));
    totalPaid += rowPayment;

    rows.push({
      month: pIdx,
      date: endDate,
      days,
      payment: rowPayment,
      principal: principalPart,
      interest: round2(pureInterest + rowDeferred),
      deferred: rowDeferred,
      balance,
      isGrace: false,
      periodIndex: pIdx,
    });
  }

  return {
    rows,
    payment: round2(basePayment + deferredInstallment),
    totalPaid: round2(totalPaid),
    deferredTotal: round2(deferredTotal),
    totals: computeScheduleTotals(rows),
  };
}

export function buildDifferentiatedSchedule(
  principal: number,
  annualRatePercent: number,
  months: number,
  disbDate: Date,
  dayBasis: DayBasis,
  gracePeriods: number,
  freq: number
): import("./types").DiffResult {
  const totalPeriods = Math.floor(months / freq);
  const mainPeriods = totalPeriods - gracePeriods;
  const rows: ScheduleRow[] = [];
  let totalPaid = 0;
  let balance = principal;
  let deferredTotal = 0;

  for (let p = 1; p <= gracePeriods; p++) {
    const endDate = paymentDate(disbDate, p, freq);
    const gDays = daysInPeriod(disbDate, p, freq, dayBasis);
    const gInterest = calcInterest(balance, annualRatePercent, gDays, dayBasis, endDate);
    deferredTotal += gInterest;
    rows.push({
      month: p,
      date: endDate,
      days: gDays,
      payment: 0,
      principal: 0,
      interest: round2(gInterest),
      deferred: 0,
      balance: round2(balance),
      isGrace: true,
      periodIndex: p,
    });
  }

  const deferredInstallment = mainPeriods > 0 ? deferredTotal / mainPeriods : 0;
  const principalSlice = mainPeriods > 0 ? round2(principal / mainPeriods) : 0;

  for (let q = 0; q < mainPeriods; q++) {
    const pIdx = gracePeriods + 1 + q;
    const endDate = paymentDate(disbDate, pIdx, freq);
    const days = daysInPeriod(disbDate, pIdx, freq, dayBasis);
    const isLast = q === mainPeriods - 1;
    const pureInterest = calcInterest(balance, annualRatePercent, days, dayBasis, endDate);
    const body = isLast ? round2(balance) : principalSlice;
    const rowDeferred = round2(deferredInstallment);
    const rowInterest = round2(pureInterest + rowDeferred);
    const rowPayment = round2(body + rowInterest);
    balance = round2(Math.max(0, balance - body));
    totalPaid += rowPayment;

    rows.push({
      month: pIdx,
      date: endDate,
      days,
      payment: rowPayment,
      principal: body,
      interest: rowInterest,
      deferred: rowDeferred,
      balance,
      isGrace: false,
      periodIndex: pIdx,
    });
  }

  const mainRows = rows.filter((r) => !r.isGrace);
  return {
    rows,
    firstPayment: round2(mainRows.length ? mainRows[0].payment : 0),
    lastPayment: round2(mainRows.length ? mainRows[mainRows.length - 1].payment : 0),
    totalPaid: round2(totalPaid),
    deferredTotal: round2(deferredTotal),
    totals: computeScheduleTotals(rows),
  };
}

export function calcEIR(
  netPrincipal: number,
  rows: ScheduleRow[],
  disbDate: Date,
  dayBasis: DayBasis
): number | null {
  const paymentRows = rows.filter((r) => r.payment > 0);
  if (!netPrincipal || netPrincipal <= 0 || !paymentRows.length) return null;

  const cf = paymentRows.map((r) => ({
    t: daysBetween(disbDate, r.date) / resolveYearBasis(dayBasis, r.date),
    pmt: r.payment,
  }));

  function npv(r: number): number {
    return cf.reduce((s, c) => s + c.pmt / Math.pow(1 + r, c.t), -netPrincipal);
  }

  let lo = -0.9999;
  let hi = 100;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return round3(((lo + hi) / 2) * 100);
}

export function interestSharePercent(payment: number, interest: number): number {
  if (!payment || payment <= 0) return 0;
  return Math.round((interest / payment) * 100);
}
