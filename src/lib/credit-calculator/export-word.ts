import type { CalculationResult } from "./types";
import { dayBasisLabel, interestSharePercent, paymentDate, round2 } from "./calculations";
import { formatDate, formatMoney, formatNum } from "./format";
import { t } from "./i18n";
import type { Lang } from "./types";

export function buildLoanShareText(result: CalculationResult, lang: Lang): string {
  const { input, annuity, diff, annuityEIR, diffEIR } = result;
  const pmtLabel = input.freq === 3 ? t(lang, "lbl.quarterlyPmt") : t(lang, "lbl.monthlyPmt");
  const lines = [
    t(lang, "title") + " — QHub.kz",
    "",
    t(lang, "lbl.amount") + ": " + formatMoney(input.principal),
    t(lang, "lbl.rate") + ": " + input.rate + "% · " + t(lang, "lbl.term") + ": " + input.months + " мес.",
    "",
    t(lang, "card.annuity") + ":",
    pmtLabel + ": " + formatMoney(annuity.payment),
    t(lang, "lbl.overpay") + ": " + formatMoney(annuity.totalPaid - input.principal),
    t(lang, "lbl.eir") + ": " + (annuityEIR !== null ? annuityEIR.toFixed(3) + " %" : "—"),
    "",
    t(lang, "card.diff") + ":",
    t(lang, "lbl.firstPmt") + ": " + formatMoney(diff.firstPayment),
    t(lang, "lbl.lastPmt") + ": " + formatMoney(diff.lastPayment),
    t(lang, "lbl.overpay") + ": " + formatMoney(diff.totalPaid - input.principal),
    t(lang, "lbl.eir") + ": " + (diffEIR !== null ? diffEIR.toFixed(3) + " %" : "—"),
    "",
    "https://qhub.kz/apps/credit-calculator",
  ];
  return lines.join("\n");
}

export function buildLoanWordBlob(
  result: CalculationResult,
  lang: Lang
): { blob: Blob; filename: string } {
  const html = buildLoanWordHtml(result, lang);
  return {
    blob: new Blob(["\ufeff" + html], { type: "application/msword" }),
    filename: "grafik-platezhey-" + new Date().toISOString().slice(0, 10) + ".doc",
  };
}

export function exportLoanToWord(result: CalculationResult, lang: Lang): void {
  const { blob, filename } = buildLoanWordBlob(result, lang);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLoanWordHtml(result: CalculationResult, lang: Lang): string {
  const { input, annuity, diff, annuityEIR, diffEIR } = result;
  const commAmt = input.commissionAmt || 0;
  const freqLabel = input.freq === 3 ? t(lang, "opt.quarterly") : t(lang, "opt.monthly");
  const pmtLabel = input.freq === 3 ? t(lang, "lbl.quarterlyPmt") : t(lang, "lbl.monthlyPmt");
  const stamp = new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const CSS =
    "@page { size: A4; margin: 1.8cm 1.5cm 1.8cm 2cm; }" +
    "body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; margin: 0; color: #111827; }" +
    "table { border-collapse: collapse; }" +
    ".pb { page-break-before: always; }" +
    ".sched { width: 100%; table-layout: fixed; font-size: 8pt; }" +
    ".sched th { background: #2563eb; color: #fff; font-weight: bold; font-size: 7.5pt; padding: 4px 3px; text-align: right; border: 1pt solid #1d4ed8; }" +
    ".sched th.c { text-align: center; }" +
    ".sched td { padding: 2.5px 3px; border: 1pt solid #e5e7eb; text-align: right; }" +
    ".sched td.c { text-align: center; }" +
    ".sched tbody tr.alt td { background: #f9fafb; }" +
    ".sched .grace td { color: #9ca3af; font-style: italic; }" +
    ".sched tfoot td { font-weight: bold; background: #eff6ff; color: #1e3a8a; border-top: 1.5pt solid #2563eb; }";

  const titleBar =
    "<table width='100%' cellpadding='0' cellspacing='0' style='background:#111827;margin-bottom:14px'>" +
    "<tr><td width='65%' style='padding:8px 14px;font-size:15pt;font-weight:bold;color:#fff'>" +
    t(lang, "word.title") +
    "</td><td width='35%' style='padding:8px 14px;font-size:8.5pt;color:#9ca3af;text-align:right;vertical-align:bottom;white-space:nowrap'>Сформировано: " +
    stamp +
    "</td></tr></table>";

  function pr(lbl: string, val: string) {
    return (
      "<tr><td style='padding:3px 10px 3px 0;color:#555;font-size:9pt;white-space:nowrap'>" +
      lbl +
      "</td><td style='padding:3px 0;font-weight:bold;font-size:9pt;text-align:right'>" +
      val +
      "</td></tr>"
    );
  }

  const paramsLeft =
    "<table cellspacing='0'>" +
    pr(t(lang, "lbl.amount"), formatMoney(input.principal)) +
    pr(t(lang, "lbl.rate"), input.rate + " % годовых") +
    pr(t(lang, "lbl.term"), input.months + " мес.") +
    pr(t(lang, "lbl.dayBasis"), dayBasisLabel(input.dayBasis)) +
    "</table>";

  const paramsRight =
    "<table cellspacing='0'>" +
    pr("Дата выдачи займа", formatDate(input.disbursement)) +
    pr("Первый платёж", formatDate(paymentDate(input.disbursement, 1, input.freq))) +
    pr(t(lang, "lbl.freq"), freqLabel) +
    pr(t(lang, "lbl.grace"), input.graceMonths > 0 ? input.graceMonths + " мес." : "—") +
    (commAmt > 0 ? pr(t(lang, "lbl.commission"), formatMoney(commAmt) + " *") : "") +
    "</table>";

  const sectionTitle = (txt: string) =>
    "<table width='100%' cellspacing='0' style='margin-bottom:6px'><tr>" +
    "<td style='width:5px;min-width:5px;background:#2563eb'>&nbsp;</td>" +
    "<td style='padding:3px 8px;background:#eff6ff;font-size:9pt;font-weight:bold;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.04em'>" +
    txt +
    "</td></tr></table>";

  const paramsBlock =
    sectionTitle(t(lang, "word.params")) +
    "<table width='100%' cellspacing='0' style='margin-bottom:16px'><tr>" +
    "<td width='46%' valign='top'>" +
    paramsLeft +
    "</td><td width='8%'></td><td width='46%' valign='top'>" +
    paramsRight +
    "</td></tr></table>";

  const annNonGrace = annuity.rows.filter((r) => !r.isGrace);
  const diffNonGrace = diff.rows.filter((r) => !r.isGrace);
  const annFirst = annNonGrace[0];
  const annLast = annNonGrace[annNonGrace.length - 1];
  const diffFirst = diffNonGrace[0];
  const diffLast = diffNonGrace[diffNonGrace.length - 1];
  const annOverpay = annuity.totalPaid - input.principal;
  const diffOverpay = diff.totalPaid - input.principal;

  const BLUE = "#2563eb";
  const GREEN = "#059669";

  function mc(label: string, value: string, color?: string) {
    return (
      "<small style='color:#777;font-size:7.5pt'>" +
      label +
      "</small><br><b style='font-size:9.5pt;color:" +
      (color || "#111827") +
      "'>" +
      value +
      "</b>"
    );
  }

  function uRow(annContent: string, diffContent: string, bgAnn?: string, bgDiff?: string) {
    return (
      "<tr><td width='48%' style='padding:6px 10px;border-bottom:1pt solid #e5e7eb;border-left:3pt solid " +
      BLUE +
      ";" +
      (bgAnn ? "background:" + bgAnn + ";" : "") +
      "'>" +
      annContent +
      "</td><td width='4%' style='border:none'></td><td width='48%' style='padding:6px 10px;border-bottom:1pt solid #e5e7eb;border-left:3pt solid " +
      GREEN +
      ";" +
      (bgDiff ? "background:" + bgDiff + ";" : "") +
      "'>" +
      diffContent +
      "</td></tr>"
    );
  }

  function uSep() {
    return (
      "<tr><td style='padding:3px 0;background:#dbeafe;border-left:3pt solid " +
      BLUE +
      "'></td><td style='border:none'></td><td style='padding:3px 0;background:#d1fae5;border-left:3pt solid " +
      GREEN +
      "'></td></tr>"
    );
  }

  const cardsHtml =
    "<tr><td width='48%' style='background:" +
    BLUE +
    ";padding:7px 12px;font-size:11pt;font-weight:bold;color:#fff;border-left:3pt solid " +
    BLUE +
    "'>" +
    t(lang, "card.annuity") +
    "</td><td width='4%' style='border:none'></td><td width='48%' style='background:" +
    GREEN +
    ";padding:7px 12px;font-size:11pt;font-weight:bold;color:#fff;border-left:3pt solid " +
    GREEN +
    "'>" +
    t(lang, "card.diff") +
    "</td></tr>" +
    uRow(
      mc(pmtLabel, formatMoney(annuity.payment), BLUE),
      mc(
        t(lang, "lbl.firstPmt") + " / " + t(lang, "lbl.lastPmt"),
        formatMoney(diff.firstPayment) + " / " + formatMoney(diff.lastPayment),
        GREEN
      )
    ) +
    uRow(
      annFirst
        ? mc(
            "Структура 1-го платежа",
            interestSharePercent(annFirst.payment, annFirst.interest) +
              "% проц. (" +
              formatMoney(annFirst.interest) +
              ") + " +
              (100 - interestSharePercent(annFirst.payment, annFirst.interest)) +
              "% осн. долга (" +
              formatMoney(annFirst.principal) +
              ")"
          )
        : "&nbsp;",
      diffFirst
        ? mc(
            "Структура 1-го платежа",
            interestSharePercent(diffFirst.payment, diffFirst.interest) +
              "% проц. (" +
              formatMoney(diffFirst.interest) +
              ") + " +
              (100 - interestSharePercent(diffFirst.payment, diffFirst.interest)) +
              "% осн. долга (" +
              formatMoney(diffFirst.principal) +
              ")"
          )
        : "&nbsp;"
    ) +
    uRow(
      annLast
        ? mc(
            "Структура последнего платежа",
            interestSharePercent(annLast.payment, annLast.interest) +
              "% проц. (" +
              formatMoney(annLast.interest) +
              ") + " +
              (100 - interestSharePercent(annLast.payment, annLast.interest)) +
              "% осн. долга (" +
              formatMoney(annLast.principal) +
              ")"
          )
        : "&nbsp;",
      diffLast
        ? mc(
            "Структура последнего платежа",
            interestSharePercent(diffLast.payment, diffLast.interest) +
              "% проц. (" +
              formatMoney(diffLast.interest) +
              ") + " +
              (100 - interestSharePercent(diffLast.payment, diffLast.interest)) +
              "% осн. долга (" +
              formatMoney(diffLast.principal) +
              ")"
          )
        : "&nbsp;"
    ) +
    uSep() +
    uRow(
      mc(t(lang, "lbl.totalPaid"), formatMoney(annuity.totalPaid)),
      mc(t(lang, "lbl.totalPaid"), formatMoney(diff.totalPaid))
    ) +
    uRow(
      mc(
        t(lang, "lbl.overpay"),
        formatMoney(annOverpay) + " (" + ((annOverpay / input.principal) * 100).toFixed(1) + "%)",
        BLUE
      ),
      mc(
        t(lang, "lbl.overpay"),
        formatMoney(diffOverpay) + " (" + ((diffOverpay / input.principal) * 100).toFixed(1) + "%)",
        GREEN
      ),
      "#eff6ff",
      "#ecfdf5"
    ) +
    uSep() +
    uRow(
      mc(
        t(lang, "lbl.eir"),
        annuityEIR !== null ? annuityEIR.toFixed(3) + " %" : "—",
        BLUE
      ),
      mc(t(lang, "lbl.eir"), diffEIR !== null ? diffEIR.toFixed(3) + " %" : "—", GREEN),
      "#eff6ff",
      "#ecfdf5"
    );

  const cardsBlock =
    sectionTitle("Результаты расчёта") +
    "<table width='100%' cellspacing='0' cellpadding='0' style='margin-bottom:14px'>" +
    cardsHtml +
    "</table>";

  const notes: string[] = [];
  if (input.gracePeriods > 0 && annuity.deferredTotal > 0) {
    const defTotal = annuity.deferredTotal;
    const mainPeriods = Math.floor(input.months / input.freq) - input.gracePeriods;
    const defInst = mainPeriods > 0 ? round2(defTotal / mainPeriods) : 0;
    const ppLabel = input.freq === 3 ? "кв." : "мес.";
    notes.push(
      "Льготный период " +
        input.graceMonths +
        " мес. — начисленные за период проценты <b>" +
        formatMoney(defTotal) +
        "</b> не выплачиваются, а равномерно распределяются по " +
        mainPeriods +
        " основным периодам (<b>" +
        formatMoney(defInst) +
        "/" +
        ppLabel +
        "</b>)."
    );
  }
  if (commAmt > 0) {
    notes.push(
      "* Комиссия за организацию займа <b>" +
        formatMoney(commAmt) +
        "</b> включена в расчёт ГЭСВ (вычтена из суммы займа при вычислении внутренней нормы доходности)."
    );
  }

  const notesBlock = notes.length
    ? "<table width='100%' cellspacing='0' style='border:1pt solid #bfdbfe;background:#eff6ff;margin-bottom:14px'>" +
      notes
        .map(
          (n) =>
            "<tr><td style='padding:5px 10px;font-size:8.5pt;color:#444;border-bottom:1pt solid #dbeafe'>" +
            n +
            "</td></tr>"
        )
        .join("") +
      "</table>"
    : "";

  function schedHtml(rows: typeof annuity.rows, title: string, subtitle: string) {
    const def = rows.some((r) => (r.deferred || 0) > 0);
    const colWidths = def ? [4, 10, 15, 15, 13, 12, 31] : [4, 11, 17, 17, 15, 36];
    const cols = colWidths.map((w) => "<col style='width:" + w + "%'/>").join("");
    const th = (txt: string, cls?: string) =>
      "<th" + (cls ? " class='" + cls + "'" : "") + ">" + txt + "</th>";
    const headRow =
      "<tr>" +
      th(t(lang, "th.num"), "c") +
      th(t(lang, "th.date"), "c") +
      th(t(lang, "th.payment") + ", ₸") +
      th(t(lang, "th.principal") + ", ₸") +
      th(t(lang, "th.interest") + ", ₸") +
      (def ? th(t(lang, "th.deferred") + ", ₸") : "") +
      th(t(lang, "th.balance") + ", ₸") +
      "</tr>";

    let totPay = 0,
      totPrinc = 0,
      totInt = 0,
      totDef = 0;
    const bodyRows = rows
      .map((r, idx) => {
        const g = !!r.isGrace;
        if (!g) {
          totPay += r.payment;
          totPrinc += r.principal;
          totDef += r.deferred || 0;
        }
        const pureInt = g ? r.interest : Math.max(0, r.interest - (r.deferred || 0));
        totInt += pureInt;
        const td = (txt: string, cls?: string) =>
          "<td" + (cls ? " class='" + cls + "'" : "") + ">" + txt + "</td>";
        const trCls = g ? " class='grace'" : idx % 2 === 1 ? " class='alt'" : "";
        return (
          "<tr" +
          trCls +
          ">" +
          td(String(r.month), "c") +
          td(formatDate(r.date), "c") +
          td(g ? "<i>" + t(lang, "word.grace") + "</i>" : formatNum(r.payment)) +
          td(g ? "" : formatNum(r.principal)) +
          td(formatNum(pureInt)) +
          (def ? td(r.deferred > 0 ? formatNum(r.deferred) : "") : "") +
          td(formatNum(r.balance)) +
          "</tr>"
        );
      })
      .join("");

    const footRow =
      "<tr><td></td><td style='text-align:center'>Итого</td><td>" +
      formatNum(totPay) +
      "</td><td>" +
      formatNum(totPrinc) +
      "</td><td>" +
      formatNum(totInt) +
      "</td>" +
      (def ? "<td>" + formatNum(totDef) + "</td>" : "") +
      "<td></td></tr>";

    const schedTitle =
      "<table width='100%' cellspacing='0' style='margin-bottom:6px'><tr>" +
      "<td width='4' style='background:#2563eb'>&nbsp;</td>" +
      "<td style='padding:5px 10px;background:#eff6ff'>" +
      "<span style='font-size:11pt;font-weight:bold;color:#1e3a8a'>" +
      title +
      "</span>&nbsp;&nbsp;<span style='font-size:8.5pt;color:#666'>" +
      subtitle +
      "</span></td></tr></table>";

    return (
      "<div class='pb'></div>" +
      schedTitle +
      "<table class='sched'><colgroup>" +
      cols +
      "</colgroup><thead>" +
      headRow +
      "</thead><tbody>" +
      bodyRows +
      "</tbody><tfoot>" +
      footRow +
      "</tfoot></table>"
    );
  }

  return (
    "<!DOCTYPE html><html><head><meta charset='UTF-8'/><style>" +
    CSS +
    "</style></head><body>" +
    titleBar +
    paramsBlock +
    cardsBlock +
    notesBlock +
    schedHtml(
      annuity.rows,
      t(lang, "word.annuitySchedule"),
      freqLabel + " · " + dayBasisLabel(input.dayBasis)
    ) +
    schedHtml(
      diff.rows,
      t(lang, "word.diffSchedule"),
      freqLabel + " · " + dayBasisLabel(input.dayBasis)
    ) +
    "</body></html>"
  );
}
