import type { Metadata } from "next";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import CreditCalculatorClient from "./CreditCalculatorClient";

export const metadata: Metadata = {
  title: "Кредитный калькулятор — QHub.kz",
  description:
    "Помесячный расчёт кредита: аннуитет и дифференцированные платежи. Графики, ГЭСВ, экспорт в Excel и Word. На русском, казахском и английском.",
};

const liveBadge = (
  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
    live
  </span>
);

export default function CreditCalculatorPage() {
  return (
    <PdfToolLayout
      title="Кредитный калькулятор"
      icon="💳"
      badge={liveBadge}
      shellClassName="h-screen bg-white"
    >
      <CreditCalculatorClient />
    </PdfToolLayout>
  );
}
