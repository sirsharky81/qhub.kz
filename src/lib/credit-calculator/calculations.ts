export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseDayBasis(value: string): import("./types").DayBasis {
  if (value === "365") return { type: "act365", basis: 365 };
  if (value === "30_360") return { type: "30_360", basis: 360 };
  return { type: "act360", basis: 360 };
}

export function dayBasisLabel(db: import("./types").DayBasis): string {
  if (db.type === "30_360") return "30/360 (европейский)";
  if (db.type === "act365") return "ACT/365 (факт/365)";
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

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

function addMonths(date: Date, count: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
}

export function paymentDate(disbDate: Date, periodIdx: number, freq: number): Date {
  return addMonths(disbDate, periodIdx * freq);
}

function daysInPeriod(
  disbDate: Date,
  periodIdx: number,
  freq: number,
  dayBasis: import("./types").DayBasis
): number {
  if (dayBasis.type === "30_360") return 30 * freq;
  const start = periodIdx === 1 ? disbDate : addMonths(disbDate, (periodIdx - 1) * freq);
  const end = addMonths(disbDate, periodIdx * freq);
  return daysBetween(start, end);
}

function periodInterest(
  balance: number,
  annualRatePercent: number,
  days: number,
  dayBasis: import("./types").DayBasis
): number {
  if (days <= 0 || balance <= 0 || annualRatePercent <= 0) return 0;
  return balance * (annualRatePercent / 100) * (days / dayBasis.basis);
}

function applyAnnuityPeriod(
  balance: number,
  payment: number,
  annualRatePercent: number,
  days: number,
  dayBasis: import("./types").DayBasis,
  isLast: boolean
) {
  const interest = periodInterest(balance, annualRatePercent, days, dayBasis);
  if (payment < interest - 1e-6) return null;
  let principalPart = Math.min(balance, payment - interest);
  if (principalPart < 0) return null;
  if (isLast) principalPart = balance;
  return {
    principalPart,
    interest,
    actualPayment: interest + principalPart,
    nextBalance: Math.max(0, balance - principalPart),
  };
}

function annuityPaymentForPeriods(
  principal: number,
  annualRatePercent: number,
  mainPeriods: number,
  startPeriodIdx: number,
  disbDate: Date,
  dayBasis: import("./types").DayBasis,
  freq: number
): number {
  if (mainPeriods <= 0) return 0;
  if (annualRatePercent <= 0) return round2(principal / mainPeriods);

  function simulate(payment: number): number {
    let balance = principal;
    for (let q = 0; q < mainPeriods; q++) {
      const step = applyAnnuityPeriod(
        balance,
        payment,
        annualRatePercent,
        daysInPeriod(disbDate, startPeriodIdx + q, freq, dayBasis),
        dayBasis,
        false
      );
      if (!step) return principal * 10;
      balance = step.nextBalance;
    }
    return balance;
  }

  let maxInterest = 0;
  for (let q = 0; q < mainPeriods; q++) {
    const interest = periodInterest(
      principal,
      annualRatePercent,
      daysInPeriod(disbDate, startPeriodIdx + q, freq, dayBasis),
      dayBasis
    );
    if (interest > maxInterest) maxInterest = interest;
  }

  let lo = maxInterest;
  let hi = principal / mainPeriods + lo * mainPeriods;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (simulate(mid) > 0.005) lo = mid;
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

export function buildAnnuitySchedule(
  principal: number,
  annualRatePercent: number,
  months: number,
  disbDate: Date,
  dayBasis: import("./types").DayBasis,
  gracePeriods: number,
  freq: number
): import("./types").AnnuityResult {
  const totalPeriods = Math.floor(months / freq);
  const mainPeriods = totalPeriods - gracePeriods;
  const rows: import("./types").ScheduleRow[] = [];
  let totalPaid = 0;
  let balance = principal;
  let deferredTotal = 0;

  for (let p = 1; p <= gracePeriods; p++) {
    const gDays = daysInPeriod(disbDate, p, freq, dayBasis);
    const gInterest = periodInterest(balance, annualRatePercent, gDays, dayBasis);
    deferredTotal += gInterest;
    rows.push({
      month: p,
      date: paymentDate(disbDate, p, freq),
      days: gDays,
      payment: 0,
      principal: 0,
      interest: round2(gInterest),
      deferred: 0,
      balance: round2(balance),
      isGrace: true,
    });
  }

  if (mainPeriods <= 0) {
    return { rows, payment: 0, totalPaid: 0, deferredTotal: round2(deferredTotal) };
  }

  const deferredInstallment = mainPeriods > 0 ? deferredTotal / mainPeriods : 0;
  const startIdx = gracePeriods + 1;
  const basePayment = annuityPaymentForPeriods(
    balance,
    annualRatePercent,
    mainPeriods,
    startIdx,
    disbDate,
    dayBasis,
    freq
  );

  for (let q = 0; q < mainPeriods; q++) {
    const pIdx = startIdx + q;
    const days = daysInPeriod(disbDate, pIdx, freq, dayBasis);
    const step = applyAnnuityPeriod(
      balance,
      basePayment,
      annualRatePercent,
      days,
      dayBasis,
      q === mainPeriods - 1
    );
    if (!step) break;
    balance = step.nextBalance;
    const rowDeferred = round2(deferredInstallment);
    const rowInterest = round2(step.interest + deferredInstallment);
    const rowPayment = round2(step.actualPayment + deferredInstallment);
    totalPaid += rowPayment;
    rows.push({
      month: pIdx,
      date: paymentDate(disbDate, pIdx, freq),
      days,
      payment: rowPayment,
      principal: round2(step.principalPart),
      interest: rowInterest,
      deferred: rowDeferred,
      balance: round2(balance),
      isGrace: false,
    });
  }

  return {
    rows,
    payment: round2(basePayment + deferredInstallment),
    totalPaid: round2(totalPaid),
    deferredTotal: round2(deferredTotal),
  };
}

export function buildDifferentiatedSchedule(
  principal: number,
  annualRatePercent: number,
  months: number,
  disbDate: Date,
  dayBasis: import("./types").DayBasis,
  gracePeriods: number,
  freq: number
): import("./types").DiffResult {
  const totalPeriods = Math.floor(months / freq);
  const mainPeriods = totalPeriods - gracePeriods;
  const rows: import("./types").ScheduleRow[] = [];
  let totalPaid = 0;
  let balance = principal;
  let deferredTotal = 0;

  for (let p = 1; p <= gracePeriods; p++) {
    const gDays = daysInPeriod(disbDate, p, freq, dayBasis);
    const gInterest = periodInterest(balance, annualRatePercent, gDays, dayBasis);
    deferredTotal += gInterest;
    rows.push({
      month: p,
      date: paymentDate(disbDate, p, freq),
      days: gDays,
      payment: 0,
      principal: 0,
      interest: round2(gInterest),
      deferred: 0,
      balance: round2(balance),
      isGrace: true,
    });
  }

  const deferredInstallment = mainPeriods > 0 ? deferredTotal / mainPeriods : 0;
  const principalPart = mainPeriods > 0 ? balance / mainPeriods : 0;

  for (let q = 0; q < mainPeriods; q++) {
    const pIdx = gracePeriods + 1 + q;
    const days = daysInPeriod(disbDate, pIdx, freq, dayBasis);
    const periodInt = periodInterest(balance, annualRatePercent, days, dayBasis);
    const body = q === mainPeriods - 1 ? balance : principalPart;
    const rowDeferred = round2(deferredInstallment);
    const rowInterest = round2(periodInt + deferredInstallment);
    const rowPayment = round2(body + rowInterest);
    balance = Math.max(0, balance - body);
    totalPaid += rowPayment;
    rows.push({
      month: pIdx,
      date: paymentDate(disbDate, pIdx, freq),
      days,
      payment: rowPayment,
      principal: round2(body),
      interest: rowInterest,
      deferred: rowDeferred,
      balance: round2(balance),
      isGrace: false,
    });
  }

  const mainRows = rows.filter((r) => !r.isGrace);
  return {
    rows,
    firstPayment: round2(mainRows.length ? mainRows[0].payment : 0),
    lastPayment: round2(mainRows.length ? mainRows[mainRows.length - 1].payment : 0),
    totalPaid: round2(totalPaid),
    deferredTotal: round2(deferredTotal),
  };
}

export function calcEIR(
  netPrincipal: number,
  rows: import("./types").ScheduleRow[],
  disbDate: Date
): number | null {
  if (!netPrincipal || netPrincipal <= 0 || !rows.length) return null;
  const cf = rows.map((r) => ({
    t: daysBetween(disbDate, r.date) / 365,
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
  return Math.round(((lo + hi) / 2) * 10000) / 100;
}

export function interestSharePercent(payment: number, interest: number): number {
  if (!payment || payment <= 0) return 0;
  return Math.round((interest / payment) * 100);
}

export { daysBetween, addMonths, daysInPeriod };
