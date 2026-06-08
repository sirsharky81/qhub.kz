import type { AnnuityResult, DiffResult, LoanInput, ScheduleRow } from "./types";
import { dayBasisLabel, paymentDate } from "./calculations";

const FMT_CURRENCY = '#,##0" ₸"';
const FMT_PERCENT = '0.0"%"';
const FMT_INT = "#,##0";
const FMT_DATE = "dd.mm.yyyy";

const COLOR = {
  accent: "FF2563EB",
  accentLight: "FFEFF6FF",
  border: "FFE5E7EB",
  zebra: "FFF9FAFB",
  white: "FFFFFFFF",
  text: "FF111827",
  muted: "FF6B7280",
  principal: "FF059669",
  interest: "FFEA580C",
  grace: "FFF3F4F6",
};

const COLOR_DEFERRED_BG = "FFFFF7ED";
const COLOR_DEFERRED_FG = "FFD97706";

function toExcelDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function thinBorder() {
  return {
    top: { style: "thin" as const, color: { argb: COLOR.border } },
    left: { style: "thin" as const, color: { argb: COLOR.border } },
    bottom: { style: "thin" as const, color: { argb: COLOR.border } },
    right: { style: "thin" as const, color: { argb: COLOR.border } },
  };
}

function buildParamsSheet(
  workbook: import("exceljs").Workbook,
  data: {
    input: LoanInput;
    annuity: AnnuityResult;
    diff: DiffResult;
    annuityEIR: number | null;
    diffEIR: number | null;
  }
) {
  const { input, annuity, diff, annuityEIR, diffEIR } = data;
  const { principal, rate, months, disbursement, dayBasis, gracePeriods, freq, commissionAmt } =
    input;

  const sheet = workbook.addWorksheet("Параметры", { views: [{ showGridLines: true }] });
  sheet.columns = [{ width: 28 }, { width: 20 }];
  const stamp = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").value = "Кредитный калькулятор";
  sheet.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: COLOR.accent } };
  sheet.getRow(1).height = 28;
  sheet.mergeCells("A2:B2");
  sheet.getCell("A2").value = "Сформировано: " + stamp;
  sheet.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: COLOR.muted } };

  const head = sheet.getRow(4);
  head.values = ["Параметр", "Значение"];
  head.height = 22;
  head.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.accent } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  let r = 5;
  const setLabel = (cell: import("exceljs").Cell, text: string) => {
    cell.value = text;
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = thinBorder();
    cell.font = { name: "Calibri", size: 11, color: { argb: COLOR.muted } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
  };

  function addRow(label: string, value: number, fmt: string) {
    setLabel(sheet.getCell(`A${r}`), label);
    const c = sheet.getCell(`B${r}`);
    c.value = value;
    c.numFmt = fmt;
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.border = thinBorder();
    c.font = { name: "Calibri", size: 11 };
    r++;
  }
  function addTextRow(label: string, value: string) {
    setLabel(sheet.getCell(`A${r}`), label);
    const c = sheet.getCell(`B${r}`);
    c.value = value;
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.border = thinBorder();
    c.font = { name: "Calibri", size: 11 };
    r++;
  }
  function section(title: string) {
    sheet.mergeCells(`A${r}:B${r}`);
    const c = sheet.getCell(`A${r}`);
    c.value = title;
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR.accent } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.accentLight } };
    c.border = thinBorder();
    r++;
  }

  addRow("Сумма кредита", principal, FMT_CURRENCY);
  addRow("Ставка (годовых)", rate, FMT_PERCENT);
  addTextRow("База расчёта", dayBasisLabel(dayBasis));
  addRow("Срок (месяцев)", months, FMT_INT);
  addTextRow("Периодичность", freq === 3 ? "Ежеквартально" : "Ежемесячно");
  if (gracePeriods > 0) addRow("Льготный период (пер.)", gracePeriods, FMT_INT);

  setLabel(sheet.getCell(`A${r}`), "Дата выдачи займа");
  sheet.getCell(`B${r}`).value = toExcelDate(disbursement);
  sheet.getCell(`B${r}`).numFmt = FMT_DATE;
  r++;
  setLabel(sheet.getCell(`A${r}`), "Первый платёж");
  sheet.getCell(`B${r}`).value = toExcelDate(paymentDate(disbursement, 1, freq));
  sheet.getCell(`B${r}`).numFmt = FMT_DATE;
  r += 2;

  if (commissionAmt > 0) addRow("Комиссия за организацию займа", commissionAmt, FMT_CURRENCY);

  section("Аннуитет");
  addRow("Размер платежа", annuity.payment, FMT_CURRENCY);
  addRow("Всего выплат", annuity.totalPaid, FMT_CURRENCY);
  setLabel(sheet.getCell(`A${r}`), "Переплата");
  sheet.getCell(`B${r}`).value = annuity.totalPaid - principal;
  sheet.getCell(`B${r}`).numFmt = FMT_CURRENCY;
  r++;
  if (annuityEIR !== null) addRow("ГЭСВ (аннуитет)", annuityEIR, '0.000"%"');
  r++;

  section("Дифференцированный");
  addRow("Первый платёж", diff.firstPayment, FMT_CURRENCY);
  addRow("Последний платёж", diff.lastPayment, FMT_CURRENCY);
  addRow("Всего выплат", diff.totalPaid, FMT_CURRENCY);
  setLabel(sheet.getCell(`A${r}`), "Переплата");
  sheet.getCell(`B${r}`).value = diff.totalPaid - principal;
  sheet.getCell(`B${r}`).numFmt = FMT_CURRENCY;
  r++;
  if (diffEIR !== null) addRow("ГЭСВ (диф.)", diffEIR, '0.000"%"');
}

function buildScheduleSheet(
  workbook: import("exceljs").Workbook,
  sheetName: string,
  subtitle: string,
  rows: ScheduleRow[]
) {
  const hasDeferred = rows.some((row) => (row.deferred || 0) > 0);
  const lastCol = hasDeferred ? "G" : "F";
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 4, activeCell: "A5" }],
  });

  sheet.mergeCells(`A1:${lastCol}1`);
  sheet.getCell("A1").value = "График платежей";
  sheet.mergeCells(`A2:${lastCol}2`);
  sheet.getCell("A2").value = subtitle;

  const head = sheet.getRow(4);
  head.values = hasDeferred
    ? ["№", "Дата", "Платёж", "Основной долг", "Проценты", "Отсрочка", "Остаток долга"]
    : ["№", "Дата", "Платёж", "Основной долг", "Проценты", "Остаток долга"];
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.accent } };
  });

  let rowNum = 5;
  rows.forEach((item) => {
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = item.month;
    row.getCell(2).value = toExcelDate(item.date);
    row.getCell(2).numFmt = FMT_DATE;
    row.getCell(3).value = item.payment;
    row.getCell(4).value = item.principal;
    const pureInterest = item.isGrace
      ? item.interest
      : Math.max(0, item.interest - (item.deferred || 0));
    row.getCell(5).value = pureInterest;
    if (hasDeferred) row.getCell(6).value = item.deferred || 0;
    row.getCell(hasDeferred ? 7 : 6).value = item.balance;
    rowNum++;
  });
  sheet.autoFilter = `A4:${lastCol}4`;
}

export type LoanExportData = {
  input: LoanInput;
  annuity: AnnuityResult;
  diff: DiffResult;
  annuityEIR: number | null;
  diffEIR: number | null;
};

function loanExportFilename(): string {
  return "grafik-platezhey-" + new Date().toISOString().slice(0, 10) + ".xlsx";
}

async function buildLoanWorkbook(data: LoanExportData) {
  const ExcelJS = (await import("exceljs")).default;
  const { input, annuity, diff, annuityEIR, diffEIR } = data;
  const { disbursement, dayBasis, freq } = input;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QHub.kz — Кредитный калькулятор";
  workbook.created = new Date();

  const freqLabel = freq === 3 ? "ежеквартально" : "ежемесячно";
  buildParamsSheet(workbook, { input, annuity, diff, annuityEIR, diffEIR });
  buildScheduleSheet(
    workbook,
    "Аннуитет",
    "Аннуитет — " + freqLabel + ", " + dayBasisLabel(dayBasis),
    annuity.rows
  );
  buildScheduleSheet(
    workbook,
    "Дифференцированный",
    "Дифференцированный — " + freqLabel + ", " + dayBasisLabel(dayBasis),
    diff.rows
  );

  return workbook;
}

export async function buildLoanExcelBlob(
  data: LoanExportData
): Promise<{ blob: Blob; filename: string }> {
  const workbook = await buildLoanWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename: loanExportFilename(),
  };
}

export async function exportLoanToExcel(data: LoanExportData): Promise<void> {
  const { blob, filename } = await buildLoanExcelBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
