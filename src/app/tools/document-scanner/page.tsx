import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import DocumentScannerClient from "./DocumentScannerClient";

export const metadata: Metadata = {
  title: "Сканер документов — PDF онлайн бесплатно | QHub",
  description:
    "Сканируйте документы с камеры или из галереи. Автообрезка, фильтры, многостраничный PDF — полностью локально в браузере и PWA.",
  keywords: [
    "сканер документов",
    "сканирование в pdf",
    "сканер онлайн",
    "document scanner pwa",
    "сканер без сервера",
  ],
  openGraph: {
    title: "Сканер документов | QHub",
    description: "Быстро превратите фото документов в качественный PDF — локально на устройстве.",
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
    "Сканер документов: автоопределение границ, обрезка, фильтры, многостраничный PDF — полностью в браузере.",
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
