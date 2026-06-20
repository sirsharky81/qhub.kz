import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import AudioExtractorClient from "./AudioExtractorClient";
import { AudioExtractorI18nProvider } from "@/lib/audio-extractor/i18n";

export const metadata: Metadata = {
  title: "Audio Extractor — извлечение аудио из видео | QHub",
  description:
    "Извлеките аудиодорожку из YouTube, TikTok и Instagram. Waveform, прослушивание и сохранение в MP3 или WAV.",
  keywords: [
    "извлечь аудио из youtube",
    "скачать музыку из видео",
    "youtube to mp3",
    "tiktok audio",
    "instagram reel audio",
    "waveform",
  ],
  openGraph: {
    title: "Audio Extractor | QHub",
    description:
      "Извлечение аудиодорожки из видео-ссылок с waveform и экспортом MP3/WAV.",
    url: "https://qhub.kz/tools/audio-extractor",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Audio Extractor",
  url: "https://qhub.kz/tools/audio-extractor",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Извлечение аудиодорожки из YouTube, TikTok и Instagram с waveform и экспортом MP3/WAV.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

export default function AudioExtractorPage() {
  return (
    <PdfToolLayout title="Audio Extractor" icon="🎙️" shellClassName="min-h-[100dvh] flex flex-col bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <AudioExtractorI18nProvider>
        <div className="flex flex-col flex-1 min-h-0">
          <AudioExtractorClient />
        </div>
      </AudioExtractorI18nProvider>
    </PdfToolLayout>
  );
}
