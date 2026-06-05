import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Кредитный калькулятор — QHub.kz",
  description:
    "Помесячный расчёт кредита: аннуитет и дифференцированные платежи. Графики, ГЭСВ, экспорт в Excel и Word. На русском, казахском и английском.",
};

export default function CreditCalculatorPage() {
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Thin top bar */}
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded bg-gray-900 flex items-center justify-center">
            <span className="text-white font-bold text-[10px] leading-none">Q</span>
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <div className="flex items-center gap-1.5">
          <span className="text-base">💳</span>
          <span className="text-sm font-medium text-gray-800">Кредитный калькулятор</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
            live
          </span>
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors hidden sm:block"
          >
            ← Все приложения
          </Link>
        </div>
      </div>

      {/* Full-height iframe */}
      <iframe
        src="/apps/credit-calculator.html"
        className="flex-1 w-full border-none"
        title="Кредитный калькулятор"
      />
    </div>
  );
}
