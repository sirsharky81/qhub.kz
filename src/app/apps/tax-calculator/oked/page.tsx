import type { Metadata } from "next";
import Link from "next/link";
import {
  SELF_EMPLOYED_OKED,
  SELF_EMPLOYED_OKED_SOURCE_URL,
} from "@/lib/tax-calculator/rules/self-employed-oked";

export const metadata: Metadata = {
  title: "Перечень ОКЭД для самозанятых 2026 — QHub",
  description:
    "40 видов деятельности по ОКЭД для применения СНР самозанятых в Казахстане. Постановление Правительства РК № 994.",
};

export default function SelfEmployedOkedPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=4" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <Link
          href="/apps/tax-calculator"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Налоговый калькулятор
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <span className="text-sm font-medium text-gray-800">ОКЭД самозанятых</span>
      </div>

      <main className="flex-1 overflow-y-auto bg-dot-grid">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <header>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Перечень ОКЭД для самозанятых
            </h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              40 видов деятельности, по которым разрешено применение специального налогового режима
              для самозанятых. Постановление Правительства РК № 994 от 21 ноября 2025 года,
              действует с 1 января 2026 года.
            </p>
          </header>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 text-left font-semibold border-b border-gray-100 w-12">
                      №
                    </th>
                    <th className="px-4 py-3 text-left font-semibold border-b border-gray-100 w-24">
                      ОКЭД
                    </th>
                    <th className="px-4 py-3 text-left font-semibold border-b border-gray-100">
                      Вид деятельности
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SELF_EMPLOYED_OKED.map((row) => (
                    <tr key={row.code} className="hover:bg-gray-50/60 align-top">
                      <td className="px-4 py-3 border-b border-gray-50 text-gray-400 tabular-nums">
                        {row.num}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50 font-mono font-semibold text-purple-700 whitespace-nowrap">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50 text-gray-800">
                        {row.nameRu}
                        {row.note && (
                          <span className="block text-xs text-amber-700 mt-1">* {row.note}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="text-xs text-gray-400 leading-relaxed pb-8 space-y-2">
            <p>
              Источник:{" "}
              <a
                href={SELF_EMPLOYED_OKED_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 underline hover:text-purple-800"
              >
                adilet.zan.kz — Постановление № 994
              </a>
            </p>
            <p>
              <Link
                href="/apps/tax-calculator"
                className="text-gray-600 hover:text-gray-900 underline"
              >
                ← Вернуться к налоговому калькулятору
              </Link>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
