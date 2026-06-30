import { saveBlobToDevice } from "@/lib/platform/save-file";
import type { CalculationResult, Lang, RegulatoryMeta, RepaymentMethod } from "./types";
import { dayBasisLabel, withDisbursementRow } from "./calculations";
import {
  formatDate,
  formatMoney2,
  formatNum2,
  formatPlaceholder,
} from "./format";
import { t } from "./i18n";

function repaymentMethodLabel(lang: Lang, method: RepaymentMethod): string {
  if (method === "differentiated") {
    return lang === "kk" ? "дифференциалды" : lang === "en" ? "differentiated" : "дифференцированный";
  }
  return lang === "kk" ? "аннуитеттік" : lang === "en" ? "annuity" : "аннуитетный";
}

function formatScheduleDate(iso: string, fallback: Date): string {
  if (iso) {
    const d = new Date(iso + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(d);
    }
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(fallback);
}

export function buildRegulatoryWordHtml(
  result: CalculationResult,
  meta: RegulatoryMeta,
  lang: Lang
): string {
  const { input } = result;
  const method = meta.repaymentMethod;
  const schedule = method === "annuity" ? result.annuity : result.diff;
  const eir = method === "annuity" ? result.annuityEIR : result.diffEIR;
  const scheduleRows = withDisbursementRow(
    schedule.rows,
    input.disbursement,
    input.principal
  );
  const totals = schedule.totals;

  const scheduleDateStr = formatScheduleDate(meta.scheduleDate, new Date());
  const contractDateStr = meta.contractDate
    ? formatScheduleDate(meta.contractDate, input.disbursement)
    : "___________";

  const CSS =
    "@page { size: A4; margin: 1.5cm 1.2cm; }" +
    "body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; margin: 0; color: #000; }" +
    "table { border-collapse: collapse; width: 100%; }" +
    ".title { text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 14px; }" +
    ".meta td { border: 1pt solid #000; padding: 4px 6px; vertical-align: top; font-size: 10pt; }" +
    ".meta .lbl { width: 52%; }" +
    ".sched th, .sched td { border: 1pt solid #000; padding: 3px 4px; font-size: 9pt; text-align: right; }" +
    ".sched th { text-align: center; font-weight: bold; background: #f5f5f5; }" +
    ".sched td.c { text-align: center; }" +
    ".sched tfoot td { font-weight: bold; }" +
    ".notes { font-size: 9pt; margin-top: 12px; }" +
    ".sign { margin-top: 24px; width: 100%; }" +
    ".sign td { width: 50%; vertical-align: top; padding-top: 40px; font-size: 10pt; }";

  const metaRows = [
    [
      "Фамилия, имя, отчество (при его наличии)/наименование заемщика",
      formatPlaceholder(meta.borrowerName),
    ],
    ["Индивидуальный идентификационный номер (ИИН)/бизнес-идентификационный номер (БИН) заемщика", formatPlaceholder(meta.borrowerId)],
    ["Сумма и валюта займа", formatMoney2(input.principal) + " (KZT)"],
    ["Размер ставки вознаграждения", input.rate + " процент (-ов) годовых"],
    [
      "Размер годовой эффективной ставки вознаграждения",
      eir !== null ? eir.toFixed(3) + " процент (-ов) годовых" : "___________",
    ],
    ["Срок займа", input.months + " месяцев"],
    [
      "Выбранный заемщиком (созаемщиком) метод погашения займа",
      repaymentMethodLabel(lang, method),
    ],
  ];

  const metaTable =
    "<table class='meta'>" +
    metaRows
      .map(
        ([lbl, val]) =>
          "<tr><td class='lbl'>" + lbl + "</td><td>" + val + "</td></tr>"
      )
      .join("") +
    "</table>";

  const bodyRows = scheduleRows
    .map((r) => {
      if (r.isDisbursement) {
        return (
          "<tr>" +
          "<td class='c'>" +
          formatDate(r.date) +
          "</td>" +
          "<td>—</td><td>—</td><td>—</td>" +
          "<td>" +
          formatNum2(r.balance) +
          "</td></tr>"
        );
      }
      if (r.isGrace) {
        return (
          "<tr>" +
          "<td class='c'>" +
          formatDate(r.date) +
          "</td>" +
          "<td>—</td>" +
          "<td>" +
          formatNum2(r.interest) +
          "</td>" +
          "<td>—</td>" +
          "<td>" +
          formatNum2(r.balance) +
          "</td></tr>"
        );
      }
      const pureInterest = Math.max(0, r.interest - (r.deferred || 0));
      return (
        "<tr>" +
        "<td class='c'>" +
        formatDate(r.date) +
        "</td>" +
        "<td>" +
        formatNum2(r.payment) +
        "</td>" +
        "<td>" +
        formatNum2(pureInterest) +
        "</td>" +
        "<td>" +
        formatNum2(r.principal) +
        "</td>" +
        "<td>" +
        formatNum2(r.balance) +
        "</td></tr>"
      );
    })
    .join("");

  const footRow =
    "<tr><td class='c'>Итого:</td>" +
    "<td>" +
    formatNum2(totals.totalPayment) +
    "</td>" +
    "<td>" +
    formatNum2(totals.totalInterest) +
    "</td>" +
    "<td>" +
    formatNum2(totals.totalPrincipal) +
    "</td>" +
    "<td></td></tr>";

  const notes =
    "<div class='notes'><b>Примечание:</b><br>" +
    "В графе 1 вводятся даты совершения платежей (первая дата является датой выдачи займа).<br>" +
    "В графе 2 вводятся суммы платежей заемщика (первая сумма платежа со стороны заемщика отсутствует).<br>" +
    "В графах 3 и 4 вводятся суммы вознаграждения и основного долга, составляющие сумму платежа заемщика.<br>" +
    "В графе 5 вводятся остатки основного долга (задолженности) после произведенного очередного платежа заемщика.<br>" +
    "В строке «Итого» вводятся суммы потоков платежей по графам 2, 3 и 4.</div>";

  const signBlock =
    "<table class='sign'><tr>" +
    "<td>Реквизиты банка<br><br><br>_____________________</td>" +
    "<td>Реквизиты заемщика (созаемщика)<br><br><br>_____________________</td>" +
    "</tr></table>";

  const title =
    "<div class='title'>График погашения займа от " +
    scheduleDateStr +
    " к Договору банковского займа № " +
    formatPlaceholder(meta.contractNumber) +
    " от " +
    contractDateStr +
    "</div>";

  const scheduleTable =
    "<table class='sched' style='margin-top:14px'>" +
    "<thead><tr>" +
    "<th rowspan='2'>Дата платежа</th>" +
    "<th colspan='3'>Платежи за период</th>" +
    "<th rowspan='2'>Остаток основного долга</th>" +
    "</tr><tr>" +
    "<th>Сумма платежа</th><th>Вознаграждение</th><th>Основной долг</th>" +
    "</tr><tr>" +
    "<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>" +
    "</tr></thead><tbody>" +
    bodyRows +
    "</tbody><tfoot>" +
    footRow +
    "</tfoot></table>";

  const basisNote =
    "<p style='font-size:9pt;color:#444;margin-top:8px'>База расчёта: " +
    dayBasisLabel(input.dayBasis) +
    " · Методика НБ РК № 8</p>";

  return (
    "<!DOCTYPE html><html><head><meta charset='UTF-8'/><style>" +
    CSS +
    "</style></head><body>" +
    title +
    metaTable +
    scheduleTable +
    basisNote +
    signBlock +
    notes +
    "</body></html>"
  );
}

export function buildRegulatoryWordBlob(
  result: CalculationResult,
  meta: RegulatoryMeta,
  lang: Lang
): { blob: Blob; filename: string } {
  const html = buildRegulatoryWordHtml(result, meta, lang);
  return {
    blob: new Blob(["\ufeff" + html], { type: "application/msword" }),
    filename:
      "grafik-pogasheniya-nb-" + new Date().toISOString().slice(0, 10) + ".doc",
  };
}

export function exportRegulatorySchedule(
  result: CalculationResult,
  meta: RegulatoryMeta,
  lang: Lang
): void {
  const { blob, filename } = buildRegulatoryWordBlob(result, meta, lang);
  void saveBlobToDevice(blob, filename);
}
