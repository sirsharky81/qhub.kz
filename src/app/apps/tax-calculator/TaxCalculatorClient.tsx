"use client";

import { useCallback, useEffect, useState } from "react";
import BenefitsApplied from "@/components/tax-calculator/BenefitsApplied";
import BenefitsChips from "@/components/tax-calculator/BenefitsChips";
import CalculationExplainer from "@/components/tax-calculator/CalculationExplainer";
import ExpenseInputs from "@/components/tax-calculator/ExpenseInputs";
import IncomeInput from "@/components/tax-calculator/IncomeInput";
import RegimeConditions from "@/components/tax-calculator/RegimeConditions";
import LimitWarnings from "@/components/tax-calculator/LimitWarnings";
import NetIncomeHero from "@/components/tax-calculator/NetIncomeHero";
import PaymentBreakdown from "@/components/tax-calculator/PaymentBreakdown";
import RegimeComparisonCards from "@/components/tax-calculator/RegimeComparisonCards";
import RegimeSelector from "@/components/tax-calculator/RegimeSelector";
import TestingBanner from "@/components/tax-calculator/TestingBanner";
import YearRegionSelect from "@/components/tax-calculator/YearRegionSelect";
import {
  DEFAULT_VALUES,
  runCalculation,
  validateInputs,
  type FormValues,
} from "@/lib/tax-calculator/calculate";
import { formatMoney } from "@/lib/tax-calculator/format";
import { LANG_OPTIONS, t } from "@/lib/tax-calculator/i18n";
import type { BenefitId, CalculationOutput, Lang, RegimeId, TabId } from "@/lib/tax-calculator/types";

const TABS: { id: TabId; key: string }[] = [
  { id: "summary", key: "tab.summary" },
  { id: "breakdown", key: "tab.breakdown" },
  { id: "benefits", key: "tab.benefits" },
  { id: "comparison", key: "tab.comparison" },
];

const inputClass =
  "w-full px-3 py-2 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 transition-colors";
const labelClass = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";
const btnPrimary =
  "px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors shadow-sm";
const btnSecondary =
  "px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors";

export default function TaxCalculatorClient() {
  const [lang, setLang] = useState<Lang>("ru");
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [output, setOutput] = useState<CalculationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [detailRegime, setDetailRegime] = useState<RegimeId | null>(null);

  const isCompareMode = values.regime === "compare_all";
  const primary = output?.primary ?? null;
  const detailResult =
    output?.results.find((r) => r.regime === (detailRegime ?? output?.bestRegime ?? primary?.regime)) ??
    primary;

  const calculate = useCallback(() => {
    const validated = validateInputs(values, lang);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }
    setError(null);
    const result = runCalculation(validated.input);
    setOutput(result);
    if (validated.input.regime !== "compare_all") {
      setDetailRegime(validated.input.regime);
    } else if (result.bestRegime) {
      setDetailRegime(result.bestRegime);
    }
  }, [values, lang]);

  useEffect(() => {
    calculate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBenefit(id: BenefitId) {
    setValues((prev) => ({
      ...prev,
      benefits: prev.benefits.includes(id)
        ? prev.benefits.filter((b) => b !== id)
        : [...prev.benefits, id],
    }));
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-dot-grid print:bg-white">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <TestingBanner lang={lang} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              {t(lang, "app.title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t(lang, "app.subtitle")}</p>
          </div>
          <div className="flex gap-1 self-start">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLang(opt.id)}
                className={
                  "px-2.5 py-1 text-xs rounded-md border transition-colors " +
                  (lang === opt.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-500 hover:border-gray-400")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input panel */}
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-5 print:hidden">
          <IncomeInput
            income={values.income}
            period={values.period}
            lang={lang}
            inputClass={inputClass}
            labelClass={labelClass}
            onIncomeChange={(v) => updateField("income", v)}
            onPeriodChange={(p) => updateField("period", p)}
          />

          <YearRegionSelect
            year={values.year}
            regionId={values.regionId}
            lang={lang}
            inputClass={inputClass}
            labelClass={labelClass}
            onYearChange={(y) => updateField("year", y)}
            onRegionChange={(r) => updateField("regionId", r)}
          />

          <RegimeSelector
            regime={values.regime}
            lang={lang}
            labelClass={labelClass}
            onChange={(r) => updateField("regime", r)}
          />

          <RegimeConditions regime={values.regime} year={values.year} lang={lang} />

          <ExpenseInputs
            businessExpenses={values.businessExpenses}
            payrollExpenses={values.payrollExpenses}
            regime={values.regime}
            year={values.year}
            lang={lang}
            inputClass={inputClass}
            labelClass={labelClass}
            onBusinessExpensesChange={(v) => updateField("businessExpenses", v)}
            onPayrollExpensesChange={(v) => updateField("payrollExpenses", v)}
          />

          <BenefitsChips
            benefits={values.benefits}
            disabledChildrenCount={values.disabledChildrenCount}
            lang={lang}
            labelClass={labelClass}
            inputClass={inputClass}
            onToggle={toggleBenefit}
            onChildrenChange={(c) => updateField("disabledChildrenCount", c)}
          />

          {error && (
            <div className="text-sm px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={calculate} className={btnPrimary}>
              {t(lang, "btn.calculate")}
            </button>
            <button type="button" onClick={handlePrint} className={btnSecondary}>
              {t(lang, "btn.print")}
            </button>
          </div>
        </section>

        {/* Results */}
        {output && primary && detailResult && (
          <>
            <NetIncomeHero
              result={detailResult}
              lang={lang}
              isBest={isCompareMode && detailResult.regime === output.bestRegime}
            />

            {isCompareMode && (
              <section className="print:hidden">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">{t(lang, "tab.comparison")}</h2>
                <RegimeComparisonCards
                  results={output.results}
                  bestRegime={output.bestRegime}
                  lang={lang}
                  selectedRegime={detailRegime}
                  onSelect={setDetailRegime}
                />
              </section>
            )}

            <LimitWarnings warnings={detailResult.warnings} lang={lang} />

            {/* Tabs */}
            <div className="print:hidden">
              <div className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200">
                {TABS.filter((tab) => isCompareMode || tab.id !== "comparison").map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={
                      "flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                      (activeTab === tab.id
                        ? "border-purple-600 text-purple-700"
                        : "border-transparent text-gray-500 hover:text-gray-800")
                    }
                  >
                    {t(lang, tab.key)}
                  </button>
                ))}
              </div>
            </div>

            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
              {activeTab === "summary" && (
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {detailResult.deductions.length > 0 && (
                      <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                        <dt className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">
                          {t(lang, "summary.expenses")}
                        </dt>
                        <dd className="text-lg font-bold text-gray-900 tabular-nums mt-1">
                          {formatMoney(detailResult.deductions.reduce((s, d) => s + d.amount, 0))}
                        </dd>
                      </div>
                    )}
                    {detailResult.taxableIncome != null && detailResult.deductions.length > 0 && (
                      <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                        <dt className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">
                          {t(lang, "summary.taxable")}
                        </dt>
                        <dd className="text-lg font-bold text-gray-900 tabular-nums mt-1">
                          {formatMoney(detailResult.taxableIncome)}
                        </dd>
                      </div>
                    )}
                    <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100">
                      <dt className="text-[10px] uppercase tracking-wider text-purple-600 font-semibold">
                        {t(lang, "summary.taxes")}
                      </dt>
                      <dd className="text-lg font-bold text-gray-900 tabular-nums mt-1">
                        {formatMoney(detailResult.totalTaxes)}
                      </dd>
                    </div>
                    <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100">
                      <dt className="text-[10px] uppercase tracking-wider text-orange-600 font-semibold">
                        {t(lang, "summary.social")}
                      </dt>
                      <dd className="text-lg font-bold text-gray-900 tabular-nums mt-1">
                        {formatMoney(detailResult.totalSocial)}
                      </dd>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        {t(lang, "summary.total")}
                      </dt>
                      <dd className="text-lg font-bold text-gray-900 tabular-nums mt-1">
                        {formatMoney(detailResult.totalPayments)}
                      </dd>
                    </div>
                  </dl>
                  <RegimeConditions
                    regime={detailResult.regime}
                    year={values.year}
                    lang={lang}
                    compact
                  />
                  <CalculationExplainer regime={detailResult.regime} lang={lang} />
                </div>
              )}

              {activeTab === "breakdown" && <PaymentBreakdown result={detailResult} lang={lang} />}

              {activeTab === "benefits" && <BenefitsApplied result={detailResult} lang={lang} />}

              {activeTab === "comparison" && isCompareMode && (
                <div className="space-y-4">
                  <RegimeComparisonCards
                    results={output.results}
                    bestRegime={output.bestRegime}
                    lang={lang}
                    selectedRegime={detailRegime}
                    onSelect={setDetailRegime}
                  />
                  {output.results.map((r) =>
                    r.isEligible ? (
                      <div key={r.regime} className="border-t border-gray-100 pt-4">
                        <h3 className="text-sm font-semibold text-gray-800 mb-2">
                          {t(lang, `regime.${r.regime}`)}
                        </h3>
                        <PaymentBreakdown result={r} lang={lang} />
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* Disclaimer */}
        {output && (
          <footer className="text-xs text-gray-400 leading-relaxed pb-6 print:text-gray-600">
            <p>{t(lang, "disclaimer.text")}</p>
            <p className="mt-1">
              {t(lang, "disclaimer.updated")}: {output.lastUpdated} · {t(lang, "deadline.monthly")}
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
