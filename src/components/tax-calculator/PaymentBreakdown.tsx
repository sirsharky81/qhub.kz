"use client";

import { formatMoney } from "@/lib/tax-calculator/format";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, TaxResult } from "@/lib/tax-calculator/types";

interface PaymentBreakdownProps {
  result: TaxResult;
  lang: Lang;
}

export default function PaymentBreakdown({ result, lang }: PaymentBreakdownProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="px-4 py-2.5 text-left font-semibold border-b border-gray-100">
              {t(lang, "breakdown.amount")}
            </th>
            <th className="px-4 py-2.5 text-left font-semibold border-b border-gray-100 hidden sm:table-cell">
              {t(lang, "breakdown.formula")}
            </th>
            <th className="px-4 py-2.5 text-right font-semibold border-b border-gray-100">
              ₸
            </th>
          </tr>
        </thead>
        <tbody>
          {result.deductions.length > 0 && (
            <tr className="bg-emerald-50/40">
              <td colSpan={3} className="px-4 py-2 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold border-b border-emerald-100">
                {t(lang, "breakdown.deductions_section")}
              </td>
            </tr>
          )}
          {result.deductions.map((d, i) => (
            <tr key={`ded-${i}`} className="text-emerald-800 bg-emerald-50/20">
              <td className="px-4 py-2.5 border-b border-gray-50 font-medium">{t(lang, d.labelKey)}</td>
              <td className="px-4 py-2.5 border-b border-gray-50 text-xs text-emerald-600 hidden sm:table-cell">
                {d.formula ?? "−"}
              </td>
              <td className="px-4 py-2.5 text-right border-b border-gray-50 font-medium tabular-nums">
                −{formatMoney(d.amount)}
              </td>
            </tr>
          ))}
          {result.lineItems
            .filter((item) => item.category !== "deduction")
            .map((item) => (
            <tr key={item.id} className={item.exempted ? "text-gray-400 bg-gray-50/50" : "hover:bg-gray-50/60"}>
              <td className="px-4 py-2.5 border-b border-gray-50">
                <span className="font-medium text-gray-800">{t(lang, item.labelKey)}</span>
                {item.exempted && (
                  <span className="ml-2 text-[10px] uppercase text-emerald-600 font-semibold">
                    {t(lang, "breakdown.exempted")}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 border-b border-gray-50 text-xs text-gray-500 hidden sm:table-cell">
                {item.formula}
              </td>
              <td
                className={
                  "px-4 py-2.5 text-right border-b border-gray-50 font-medium " +
                  (item.category === "tax" ? "text-purple-700" : "text-orange-600")
                }
              >
                {formatMoney(item.amount)}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-4 py-2.5" colSpan={2}>
              {t(lang, "summary.total")}
            </td>
            <td className="px-4 py-2.5 text-right text-gray-900">{formatMoney(result.totalPayments)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
