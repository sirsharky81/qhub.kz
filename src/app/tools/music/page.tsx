import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import MusicPlayerClient from "./MusicPlayerClient";

export const metadata: Metadata = {
  title: "QHub Music — локальный музыкальный плеер | QHub",
  description:
    "Слушайте музыку прямо в браузере. Импорт MP3, FLAC, WAV и других форматов. Всё хранится локально — файлы не загружаются на сервер.",
  keywords: [
    "музыкальный плеер онлайн",
    "локальный плеер",
    "слушать mp3 в браузере",
    "музыка без загрузки",
    "PWA плеер",
  ],
  openGraph: {
    title: "QHub Music | QHub",
    description: "Полноценный локальный музыкальный плеер в браузере.",
    url: "https://qhub.kz/tools/music",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Music",
  url: "https://qhub.kz/tools/music",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Локальный музыкальный плеер: импорт папок и файлов, медиатека, очередь, фоновое воспроизведение.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

export default function MusicPage() {
  return (
    <PdfToolLayout title="QHub Music" icon="🎧" shellClassName="h-[100dvh] bg-gray-50 dark:bg-gray-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <MusicPlayerClient />
    </PdfToolLayout>
  );
}
