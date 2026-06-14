import type { Metadata } from "next";
import Link from "next/link";
import TestingBadge from "@/components/TestingBadge";
import TaxCalculatorClient from "./TaxCalculatorClient";

export const metadata: Metadata = {
  title: "Налоговый калькулятор ИП Казахстан 2026 — QHub",
  description:
    "Рассчитайте налоги ИП: упрощёнка, ОУР, самозанятые. ОПВ, ВОСМС, чистый доход. Льготы для пенсионеров и инвалидов. Бесплатно.",
};

export default function TaxCalculatorPage() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3 print:hidden">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=2" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <div className="flex items-center gap-1.5">
          <span className="text-base">🧾</span>
          <span className="text-sm font-medium text-gray-800">Налоговый калькулятор ИП</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TestingBadge />
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors hidden sm:block"
          >
            ← Все приложения
          </Link>
        </div>
      </div>

      <TaxCalculatorClient />
    </div>
  );
}
