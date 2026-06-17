import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "./QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR-генератор онлайн бесплатно | QHub",
  description:
    "Создавайте QR-коды для ссылок, Wi-Fi, vCard, реквизитов, WhatsApp и Telegram — полностью локально в браузере и PWA.",
  keywords: [
    "qr генератор",
    "qr код онлайн",
    "qr wifi",
    "qr vcard",
    "qr реквизиты",
    "qr code generator",
  ],
  openGraph: {
    title: "QR-генератор | QHub",
    description: "Быстрый генератор QR-кодов — данные не покидают устройство.",
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
    "Генератор QR-кодов: ссылки, текст, Wi-Fi, vCard, реквизиты, WhatsApp, Telegram — локально в браузере.",
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
