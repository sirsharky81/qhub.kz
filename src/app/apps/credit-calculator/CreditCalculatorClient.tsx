"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runCalculation, validateInputs, type FormValues } from "@/lib/credit-calculator/calculate";
import { dayBasisLabel, interestSharePercent, paymentDate, round2, todayISODate } from "@/lib/credit-calculator/calculations";
import { drawBreakdownChart } from "@/lib/credit-calculator/chart";
import { exportLoanToExcel } from "@/lib/credit-calculator/export-excel";
import { buildLoanShareText, buildLoanWordBlob, exportLoanToWord } from "@/lib/credit-calculator/export-word";
import {
  formatAmountInput,
  formatDate,
  formatMoney,
  formatRateField,
  parseAmountInput,
  parseRateInput,
} from "@/lib/credit-calculator/format";
import { LANG_OPTIONS, t } from "@/lib/credit-calculator/i18n";
import type {
  CalculationResult,
  ChartType,
  ChartView,
  CommissionType,
  Lang,
  ScheduleRow,
  TabId,
} from "@/lib/credit-calculator/types";

const DEFAULT_VALUES: FormValues = {
  amount: "1 000 000",
  rate: "12",
  dayBasis: "360",
  term: "36",
  disbursementDate: todayISODate(),
  gracePeriod: "0",
  paymentFreq: "1",
  commissionVal: "0",
  commissionType: "sum",
};

const TABS: { id: TabId; key: string }[] = [
  { id: "annuity-table", key: "tab.annuity" },
  { id: "diff-table", key: "tab.diff" },
  { id: "breakdown", key: "tab.breakdown" },
];

const inputClass =
  "w-full px-3 py-2 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 transition-colors";
const labelClass = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";
const btnPrimary =
  "px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors shadow-sm";
const btnSecondary =
  "px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-45 disabled:cursor-not-allowed";

function buildDateInfo(result: CalculationResult, lang: Lang): string {
  const { input, annuity } = result;
  const freqLabel = input.freq === 3 ? t(lang, "opt.quarterly").toLowerCase() : t(lang, "opt.monthly").toLowerCase();
  let info =
    "Дата выдачи: " +
    formatDate(input.disbursement) +
    " · Первый платёж: " +
    formatDate(paymentDate(input.disbursement, 1, input.freq)) +
    " · " +
    dayBasisLabel(input.dayBasis) +
    " · " +
    freqLabel;

  const deferredTotal = annuity.deferredTotal || 0;
  if (input.gracePeriods > 0) {
    info += " · Льготный период: " + input.gracePeriods * input.freq + " мес.";
    if (deferredTotal > 0) {
      const mainPeriods = Math.floor(input.months / input.freq) - input.gracePeriods;
      const installment = mainPeriods > 0 ? round2(deferredTotal / mainPeriods) : 0;
      info +=
        " · Отсрочка: " +
        formatMoney(deferredTotal) +
        " (" +
        formatMoney(installment) +
        "/" +
        (input.freq === 3 ? "кв." : "мес.") +
        ")";
    }
  }
  return info;
}

function ScheduleTable({
  rows,
  hasDeferred,
  lang,
}: {
  rows: ScheduleRow[];
  hasDeferred: boolean;
  lang: Lang;
}) {
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-gray-100">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2 text-center font-semibold border-b border-gray-100">{t(lang, "th.num")}</th>
            <th className="px-3 py-2 text-center font-semibold border-b border-gray-100">{t(lang, "th.date")}</th>
            <th className="px-3 py-2 text-right font-semibold border-b border-gray-100">{t(lang, "th.payment")}</th>
            <th className="px-3 py-2 text-right font-semibold border-b border-gray-100">{t(lang, "th.principal")}</th>
            <th className="px-3 py-2 text-right font-semibold border-b border-gray-100">{t(lang, "th.interest")}</th>
            {hasDeferred && (
              <th className="px-3 py-2 text-right font-semibold border-b border-gray-100">{t(lang, "th.deferred")}</th>
            )}
            <th className="px-3 py-2 text-right font-semibold border-b border-gray-100">{t(lang, "th.balance")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.month}
              className={row.isGrace ? "text-gray-400 italic bg-gray-50/80" : "hover:bg-gray-50/60"}
            >
              <td className="px-3 py-2 text-center border-b border-gray-50">{row.month}</td>
              <td className="px-3 py-2 text-center border-b border-gray-50">{formatDate(row.date)}</td>
              <td className="px-3 py-2 text-right border-b border-gray-50">
                {row.isGrace ? (
                  <span className="text-xs not-italic">{t(lang, "word.grace")}</span>
                ) : (
                  formatMoney(row.payment)
                )}
              </td>
              <td className="px-3 py-2 text-right border-b border-gray-50">
                {row.isGrace ? "" : formatMoney(row.principal)}
              </td>
              <td className="px-3 py-2 text-right border-b border-gray-50 text-orange-600">
                {formatMoney(row.interest)}
              </td>
              {hasDeferred && (
                <td className="px-3 py-2 text-right border-b border-gray-50 text-amber-600 text-xs">
                  {row.deferred > 0 ? formatMoney(row.deferred) : ""}
                </td>
              )}
              <td className="px-3 py-2 text-right border-b border-gray-50 font-medium">{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CreditCalculatorClient() {
  const [lang, setLang] = useState<Lang>("ru");
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("annuity-table");
  const [chartView, setChartView] = useState<ChartView>("both");
  const [chartType, setChartType] = useState<ChartType>("annuity");
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const chartAnnuityRef = useRef<HTMLCanvasElement>(null);
  const chartDiffRef = useRef<HTMLCanvasElement>(null);

  const commissionHint =
    values.commissionType === "pct" && parseAmountInput(values.commissionVal) > 0
      ? "= " +
        formatMoney(
          (parseAmountInput(values.amount) || 0) * (parseAmountInput(values.commissionVal) / 100)
        )
      : null;

  const hasDeferred = (result?.annuity.deferredTotal || 0) > 0;

  const calculate = useCallback(() => {
    const validated = validateInputs(values, lang);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }
    setError(null);
    setResult(runCalculation(validated.input));
  }, [values, lang]);

  useEffect(() => {
    calculate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== "breakdown" || !result) return;
    const showAnnuity = chartView === "both" || chartType === "annuity";
    const showDiff = chartView === "both" || chartType === "diff";
    const redraw = () => {
      drawBreakdownChart(chartAnnuityRef.current, result.annuity.rows, showAnnuity);
      drawBreakdownChart(chartDiffRef.current, result.diff.rows, showDiff);
    };
    redraw();
    requestAnimationFrame(redraw);
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [result, activeTab, chartView, chartType]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleAmountChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    updateField("amount", digits ? formatAmountInput(Number(digits)) : "");
  }

  function stepRate(dir: number, step = 0.25) {
    const cur = parseRateInput(values.rate);
    const base = Number.isFinite(cur) ? cur : 0;
    let next = Math.round((base + dir * step) * 10000) / 10000;
    next = Math.max(0, Math.min(100, next));
    updateField("rate", String(next));
    setTimeout(calculate, 0);
  }

  async function handleExcelExport() {
    const validated = validateInputs(values, lang);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }
    let data = result;
    if (!data) data = runCalculation(validated.input);
    setExporting(true);
    try {
      await exportLoanToExcel(data);
    } catch {
      setError(t(lang, "err.excelFail"));
    } finally {
      setExporting(false);
    }
  }

  function handleWordExport() {
    if (!result) {
      setError(t(lang, "err.noCalc"));
      return;
    }
    exportLoanToWord(result, lang);
  }

  async function handleShare() {
    if (!result) {
      setError(t(lang, "err.noCalc"));
      return;
    }
    setSharing(true);
    setError(null);
    try {
      const { blob, filename } = buildLoanWordBlob(result, lang);
      const file = new File([blob], filename, { type: "application/msword" });
      const text = buildLoanShareText(result, lang);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t(lang, "title"),
          text,
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: t(lang, "title"),
          text,
          url: "https://qhub.kz/apps/credit-calculator",
        });
        return;
      }

      exportLoanToWord(result, lang);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(t(lang, "err.shareFail"));
      }
    } finally {
      setSharing(false);
    }
  }

  const annNonGrace = result?.annuity.rows.filter((r) => !r.isGrace) ?? [];
  const rowFirst = annNonGrace[0];
  const rowLast = annNonGrace[annNonGrace.length - 1];
  const structureText =
    rowFirst && rowLast
      ? "1-й: " +
        interestSharePercent(rowFirst.payment, rowFirst.interest) +
        "% проц. (" +
        formatMoney(rowFirst.interest) +
        ") · последний: " +
        interestSharePercent(rowLast.payment, rowLast.interest) +
        "% проц. (" +
        formatMoney(rowLast.interest) +
        ")"
      : "—";

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-dot-grid print:bg-white">
      <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-5 print:max-w-none">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 print:hidden">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1">Финансы</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {t(lang, "title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t(lang, "subtitle")}</p>
          </div>
          <div className="flex gap-1 self-start" role="group" aria-label="Language">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLang(opt.id)}
                className={[
                  "px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md border transition-colors",
                  lang === opt.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelClass} htmlFor="amount">{t(lang, "lbl.amount")}</label>
              <input
                id="amount"
                type="text"
                inputMode="numeric"
                value={values.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={() => updateField("amount", formatAmountInput(values.amount) || "0")}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="rate">{t(lang, "lbl.rate")}</label>
              <div className="flex">
                <input
                  id="rate"
                  type="text"
                  inputMode="decimal"
                  value={values.rate}
                  onChange={(e) => updateField("rate", e.target.value)}
                  onBlur={() => updateField("rate", formatRateField(values.rate))}
                  onKeyDown={(e) => e.key === "Enter" && calculate()}
                  className={[inputClass, "rounded-r-none border-r-0"].join(" ")}
                />
                <div className="flex flex-col flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => stepRate(1)}
                    className="flex-1 w-8 border border-gray-200 rounded-tr-lg bg-gray-50 text-[8px] text-gray-500 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
                    aria-label="+0.25%"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => stepRate(-1)}
                    className="flex-1 w-8 border border-t-0 border-gray-200 rounded-br-lg bg-gray-50 text-[8px] text-gray-500 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
                    aria-label="-0.25%"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="dayBasis">{t(lang, "lbl.dayBasis")}</label>
              <select
                id="dayBasis"
                value={values.dayBasis}
                onChange={(e) => {
                  updateField("dayBasis", e.target.value);
                  setTimeout(calculate, 0);
                }}
                className={inputClass}
              >
                <option value="360">{t(lang, "opt.act360")}</option>
                <option value="365">{t(lang, "opt.act365")}</option>
                <option value="30_360">{t(lang, "opt.30_360")}</option>
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="term">{t(lang, "lbl.term")}</label>
              <input
                id="term"
                type="number"
                min={1}
                max={600}
                value={values.term}
                onChange={(e) => updateField("term", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && calculate()}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="disbursementDate">{t(lang, "lbl.disbursement")}</label>
              <input
                id="disbursementDate"
                type="date"
                value={values.disbursementDate}
                onChange={(e) => {
                  updateField("disbursementDate", e.target.value);
                  setTimeout(calculate, 0);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="gracePeriod">{t(lang, "lbl.grace")}</label>
              <input
                id="gracePeriod"
                type="number"
                min={0}
                max={360}
                value={values.gracePeriod}
                onChange={(e) => updateField("gracePeriod", e.target.value)}
                onBlur={() => setTimeout(calculate, 0)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="paymentFreq">{t(lang, "lbl.freq")}</label>
              <select
                id="paymentFreq"
                value={values.paymentFreq}
                onChange={(e) => {
                  updateField("paymentFreq", e.target.value);
                  setTimeout(calculate, 0);
                }}
                className={inputClass}
              >
                <option value="1">{t(lang, "opt.monthly")}</option>
                <option value="3">{t(lang, "opt.quarterly")}</option>
              </select>
            </div>

            <div className="relative">
              <label className={labelClass} htmlFor="commissionVal">{t(lang, "lbl.commission")}</label>
              <div className="flex">
                <input
                  id="commissionVal"
                  type="text"
                  inputMode="decimal"
                  value={values.commissionVal}
                  onChange={(e) => updateField("commissionVal", e.target.value)}
                  onBlur={() => {
                    if (values.commissionType === "sum") {
                      const n = parseAmountInput(values.commissionVal);
                      updateField(
                        "commissionVal",
                        Number.isFinite(n) && n > 0 ? formatAmountInput(n) : "0"
                      );
                    }
                    calculate();
                  }}
                  className={[inputClass, "rounded-r-none border-r-0"].join(" ")}
                />
                <select
                  value={values.commissionType}
                  onChange={(e) => {
                    updateField("commissionType", e.target.value as CommissionType);
                    setTimeout(calculate, 0);
                  }}
                  className="px-2 py-2 text-sm border border-gray-200 rounded-r-lg bg-gray-50 text-gray-600 outline-none"
                >
                  <option value="sum">₸</option>
                  <option value="pct">%</option>
                </select>
              </div>
              {commissionHint && (
                <p className="absolute left-0 -bottom-5 text-xs text-blue-600">{commissionHint}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-6 mb-4 leading-relaxed">{t(lang, "hint.inputs")}</p>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={calculate} className={btnPrimary}>
              {t(lang, "btn.calc")}
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing || !result}
              className={[btnSecondary, "md:hidden"].join(" ")}
            >
              {sharing ? t(lang, "exporting") : "↗ " + t(lang, "btn.share")}
            </button>
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={exporting}
              className={btnSecondary}
            >
              {exporting ? t(lang, "exporting") : "📊 " + t(lang, "btn.excel")}
            </button>
            <button type="button" onClick={handleWordExport} className={btnSecondary}>
              📄 {t(lang, "btn.word")}
            </button>
            <button type="button" onClick={() => window.print()} className={btnSecondary}>
              🖨 {t(lang, "btn.pdf")}
            </button>
          </div>
          {canShare && (
            <p className="text-xs text-gray-400 mt-3 md:hidden">{t(lang, "share.hint")}</p>
          )}
        </section>

        {/* Summary */}
        {result && (
          <>
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
              <p className="text-xs text-gray-500 mb-4 pb-3 border-b border-gray-100">
                {buildDateInfo(result, lang)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Annuity card */}
                <article className="flex flex-col rounded-xl border border-gray-100 overflow-hidden">
                  <h2 className="px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700">
                    {t(lang, "card.annuity")}
                  </h2>
                  <dl className="flex flex-col flex-1 p-4 space-y-0">
                    <div className="space-y-2 pb-3 border-b border-gray-100">
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">
                          {result.input.freq === 3 ? t(lang, "lbl.quarterlyPmt") : t(lang, "lbl.monthlyPmt")}
                        </dt>
                        <dd className="font-semibold tabular-nums">{formatMoney(result.annuity.payment)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500 shrink-0">{t(lang, "lbl.structure")}</dt>
                        <dd className="text-xs text-right text-gray-700 max-w-[58%] leading-snug">{structureText}</dd>
                      </div>
                    </div>
                    <div className="pt-3 mt-auto space-y-2">
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.totalPaid")}</dt>
                        <dd className="font-semibold tabular-nums">{formatMoney(result.annuity.totalPaid)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-700 font-medium">{t(lang, "lbl.overpay")}</dt>
                        <dd className="font-bold tabular-nums text-blue-600">
                          {formatMoney(result.annuity.totalPaid - result.input.principal)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.eir")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {result.annuityEIR !== null ? result.annuityEIR.toFixed(3) + " %" : "—"}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </article>

                {/* Diff card */}
                <article className="flex flex-col rounded-xl border border-gray-100 overflow-hidden">
                  <h2 className="px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700">
                    {t(lang, "card.diff")}
                  </h2>
                  <dl className="flex flex-col flex-1 p-4 space-y-0">
                    <div className="space-y-2 pb-3 border-b border-gray-100">
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.firstPmt")}</dt>
                        <dd className="font-semibold tabular-nums">{formatMoney(result.diff.firstPayment)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.lastPmt")}</dt>
                        <dd className="font-semibold tabular-nums">{formatMoney(result.diff.lastPayment)}</dd>
                      </div>
                    </div>
                    <div className="pt-3 mt-auto space-y-2">
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.totalPaid")}</dt>
                        <dd className="font-semibold tabular-nums">{formatMoney(result.diff.totalPaid)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-700 font-medium">{t(lang, "lbl.overpay")}</dt>
                        <dd className="font-bold tabular-nums text-emerald-600">
                          {formatMoney(result.diff.totalPaid - result.input.principal)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500">{t(lang, "lbl.eir")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {result.diffEIR !== null ? result.diffEIR.toFixed(3) + " %" : "—"}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </article>
              </div>
            </section>

            {/* Tabs */}
            <nav className="flex flex-wrap gap-2 print:hidden" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors",
                    activeTab === tab.id
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-800",
                  ].join(" ")}
                >
                  {t(lang, tab.key)}
                </button>
              ))}
            </nav>

            {/* Tab panels */}
            {(activeTab === "annuity-table" || activeTab === "diff-table") && (
              <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
                <ScheduleTable
                  rows={activeTab === "annuity-table" ? result.annuity.rows : result.diff.rows}
                  hasDeferred={hasDeferred}
                  lang={lang}
                />
              </section>
            )}

            {activeTab === "breakdown" && (
              <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-3 sm:p-5 print:hidden">
                <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">{t(lang, "chart.hint")}</p>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-5">
                  <div className="flex flex-wrap gap-4">
                    {(["both", "single"] as ChartView[]).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="chartView"
                          checked={chartView === v}
                          onChange={() => setChartView(v)}
                          className="accent-gray-900"
                        />
                        <span className={chartView === v ? "text-gray-900 font-medium" : "text-gray-500"}>
                          {t(lang, v === "both" ? "chart.viewBoth" : "chart.viewSingle")}
                        </span>
                      </label>
                    ))}
                  </div>
                  {chartView === "single" && (
                    <div className="flex flex-wrap gap-4 pl-0 sm:pl-4 sm:border-l border-gray-200">
                      {(["annuity", "diff"] as ChartType[]).map((v) => (
                        <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="chartType"
                            checked={chartType === v}
                            onChange={() => setChartType(v)}
                            className="accent-gray-900"
                          />
                          <span className={chartType === v ? "text-gray-900 font-medium" : "text-gray-500"}>
                            {t(lang, v === "annuity" ? "chart.typeAnnuity" : "chart.typeDiff")}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {(chartView === "both" || chartType === "annuity") && (
                    <figure>
                      <figcaption className="text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-2">
                        {t(lang, "chart.capAnnuity")}
                      </figcaption>
                      <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50 min-h-[168px] sm:min-h-[200px]">
                        <canvas ref={chartAnnuityRef} className="block w-full h-[168px] sm:h-[200px]" />
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                          {t(lang, "leg.principal")}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-orange-600" />
                          {t(lang, "leg.interest")}
                        </span>
                        {hasDeferred && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                            {t(lang, "leg.deferred")}
                          </span>
                        )}
                      </div>
                    </figure>
                  )}
                  {(chartView === "both" || chartType === "diff") && (
                    <figure>
                      <figcaption className="text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-2">
                        {t(lang, "chart.capDiff")}
                      </figcaption>
                      <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50 min-h-[168px] sm:min-h-[200px]">
                        <canvas ref={chartDiffRef} className="block w-full h-[168px] sm:h-[200px]" />
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                          {t(lang, "leg.principal")}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-orange-600" />
                          {t(lang, "leg.interest")}
                        </span>
                        {hasDeferred && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                            {t(lang, "leg.deferred")}
                          </span>
                        )}
                      </div>
                    </figure>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="text-center py-4 text-[11px] text-gray-400 print:hidden">
          QHub.kz · Vibe coded with care
        </footer>
      </div>
    </div>
  );
}
