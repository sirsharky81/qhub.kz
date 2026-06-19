import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import CodeScannerClient from "./CodeScannerClient";

export const metadata: Metadata = {
  title: "Сканер QR и штрих-кодов — инвентаризация ОС | QHub",
  description:
    "Распознавание QR и штрих-кодов с камеры. Инвентаризация основных средств по базе 1С — отчёты по излишкам и недостачам, экспорт ведомости. Коробки хранения — локально в браузере и PWA.",
  keywords: [
    "распознавание qr",
    "распознавание штрихкодов",
    "инвентаризация ос",
    "излишки недостачи",
    "сканер qr",
    "метки ос",
    "база 1с",
    "основные средства",
    "сканер штрих кодов",
    "qr scanner",
    "code scanner pwa",
  ],
  openGraph: {
    title: "Сканер кодов — QR, штрих-коды, инвентаризация ОС | QHub",
    description:
      "Распознавание QR и штрих-кодов. Инвентаризация ОС по базе 1С с отчётами по излишкам и недостачам — локально на устройстве.",
    url: "https://qhub.kz/tools/code-scanner",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const ICON = "/tools/code-scanner/icon-192.png";

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Code Scanner",
  url: "https://qhub.kz/tools/code-scanner",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Распознавание QR и штрих-кодов. Инвентаризация ОС по базе 1С с отчётами по излишкам и недостачам — локально в браузере.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

export default function CodeScannerPage() {
  return (
    <PdfToolLayout
      title="Сканер кодов"
      iconSrc={ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <div className="flex flex-col flex-1 min-h-0 relative">
        <CodeScannerClient />
      </div>
    </PdfToolLayout>
  );
}
