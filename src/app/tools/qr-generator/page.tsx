import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "./QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR-генератор — метки ОС, визитки, QR и штрихкод | QHub",
  description:
    "Метки ОС с QR и штрихкодом — одна или массовая печать из базы 1С. Визитки vCard, Wi-Fi, реквизиты и ссылки — локально в браузере и PWA.",
  keywords: [
    "метки ос",
    "qr и штрихкод",
    "визитки qr",
    "инвентарные метки",
    "qr 1с",
    "основные средства",
    "qr генератор",
    "qr код онлайн",
    "qr wifi",
    "qr vcard",
    "штрихкод ос",
    "qr code generator",
  ],
  openGraph: {
    title: "QR-генератор — метки ОС, визитки | QHub",
    description:
      "Метки ОС (QR и штрихкод) из базы 1С, визитки и универсальные QR — локально на устройстве.",
    url: "https://qhub.kz/tools/qr-generator",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub QR Generator",
  url: "https://qhub.kz/tools/qr-generator",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Метки ОС с QR и штрихкодом из базы 1С. Визитки, Wi-Fi, реквизиты и ссылки — локально в браузере.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrGeneratorPage() {
  return (
    <PdfToolLayout
      title="QR-генератор"
      iconSrc={QR_ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <div className="flex flex-col flex-1 min-h-0 relative">
        <Suspense fallback={null}>
          <QrGeneratorClient />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
