import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import FileConverterClient from "./FileConverterClient";

export const metadata: Metadata = {
  title: "QHub Smart File Converter — умный конвертер файлов онлайн | QHub",
  description:
    "Конвертируйте HEIC, PDF, MP4, XLSX, EPUB и другие форматы прямо в браузере. Файлы не покидают ваше устройство.",
  keywords: [
    "конвертер файлов онлайн",
    "heic в jpg",
    "mp4 в mp3",
    "pdf в txt",
    "xlsx в csv",
    "конвертер без загрузки на сервер",
    "pwa иконки",
  ],
  openGraph: {
    title: "QHub Smart File Converter | QHub",
    description:
      "Умный помощник для работы с файлами — всё локально в браузере, без сервера.",
    url: "https://qhub.kz/tools/file-converter",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Smart File Converter",
  url: "https://qhub.kz/tools/file-converter",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Умный конвертер файлов: изображения, видео, аудио, PDF, таблицы и книги — полностью в браузере.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

function PrivacyBadge() {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
      🔒 локально
    </span>
  );
}

export default function FileConverterPage() {
  return (
    <PdfToolLayout
      title="Smart File Converter"
      icon="🔄"
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={<PrivacyBadge />}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <div className="flex flex-col flex-1 min-h-0">
        <FileConverterClient />
      </div>
    </PdfToolLayout>
  );
}
