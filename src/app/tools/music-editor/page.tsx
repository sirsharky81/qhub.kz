import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import MusicEditorClient from "./MusicEditorClient";

export const metadata: Metadata = {
  title: "Music Editor — подготовка музыки онлайн | QHub",
  description:
    "Браузерный редактор музыки для выступлений. Обрезка, склейка треков, fade, crossfade и экспорт MP3/WAV.",
  keywords: [
    "редактор музыки онлайн",
    "обрезать mp3",
    "музыка для фигурного катания",
    "склеить треки",
    "сократить музыку",
    "fade in fade out",
    "экспорт mp3",
  ],
  openGraph: {
    title: "Music Editor | QHub",
    description:
      "Подготовка музыки для фигурного катания, танцев и выступлений — прямо в браузере.",
    url: "https://qhub.kz/tools/music-editor",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Music Editor",
  url: "https://qhub.kz/tools/music-editor",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KZT",
  },
  description:
    "Браузерный редактор музыки: обрезка, склейка, fade, crossfade и сборка программы выступления.",
  provider: {
    "@type": "Organization",
    name: "QHub",
    url: "https://qhub.kz",
  },
};

export default function MusicEditorPage() {
  return (
    <PdfToolLayout title="Music Editor" icon="🎵" shellClassName="h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <MusicEditorClient />
    </PdfToolLayout>
  );
}
