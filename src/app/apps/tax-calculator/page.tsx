import type { Metadata } from "next";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import TestingBadge from "@/components/TestingBadge";
import TaxCalculatorClient from "./TaxCalculatorClient";

export const metadata: Metadata = {
  title: "Налоговый калькулятор ИП Казахстан 2026 — QHub",
  description:
    "Рассчитайте налоги ИП: упрощёнка, ОУР, самозанятые. ОПВ, ВОСМС, чистый доход. Льготы для пенсионеров и инвалидов. Бесплатно.",
};

export default function TaxCalculatorPage() {
  return (
    <PdfToolLayout
      title="Налоговый калькулятор ИП"
      icon="🧾"
      badge={<TestingBadge />}
      shellClassName="h-screen bg-white"
    >
      <TaxCalculatorClient />
    </PdfToolLayout>
  );
}
