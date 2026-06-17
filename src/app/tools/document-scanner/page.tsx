import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import DocumentScannerClient from "./DocumentScannerClient";

export const metadata: Metadata = {
  title: "Сканер документов — PDF онлайн бесплатно | QHub",
  description:
    "Сканируйте документы с камеры или из галереи. Автообрезка, фильтры, распознавание текста в Word (русский, казахский, English) и многостраничный PDF — локально в браузере и PWA.",
  keywords: [
    "сканер документов",
    "сканирование в pdf",
    "сканер онлайн",
    "распознавание текста",
    "ocr онлайн",
    "извлечь текст из фото",
    "текст в word",
    "document scanner pwa",
    "сканер без сервера",
  ],
  openGraph: {
    title: "Сканер документов | QHub",
    description:
      "Фото документов в PDF и Word: автообрезка, фильтры и OCR на русском, казахском и английском — локально на устройстве.",
    url: "https://qhub.kz/tools/document-scanner",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Document Scanner",
  url: "https://qhub.kz/tools/document-scanner",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Сканер документов: автоопределение границ, обрезка, фильтры, распознавание текста в Word (русский, казахский, English) и многостраничный PDF — полностью в браузере.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

const SCANNER_ICON = "/tools/document-scanner/icon-192.png";

export default function DocumentScannerPage() {
  return (
    <PdfToolLayout
      title="Сканер документов"
      iconSrc={SCANNER_ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <div className="flex flex-col flex-1 min-h-0 relative">
        <DocumentScannerClient />
      </div>
    </PdfToolLayout>
  );
}
