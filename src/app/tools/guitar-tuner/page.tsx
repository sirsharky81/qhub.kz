import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import GuitarTunerClient from "./GuitarTunerClient";

export const metadata: Metadata = {
  title: "Guitar Tuner — онлайн тюнер для гитары | QHub",
  description:
    "Точный хроматический тюнер в браузере. Гитара, бас, укулеле. Анализ через AudioWorklet — аудио не покидает устройство.",
  keywords: [
    "тюнер гитары онлайн",
    "guitar tuner",
    "настройка гитары",
    "тюнер бас",
    "хроматический тюнер",
  ],
  openGraph: {
    title: "Guitar Tuner | QHub",
    description: "Профессиональный браузерный тюнер для струнных инструментов.",
    url: "https://qhub.kz/tools/guitar-tuner",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Guitar Tuner",
  url: "https://qhub.kz/tools/guitar-tuner",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description: "Браузерный тюнер для гитары, баса и укулеле с pitch detection через AudioWorklet.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

export default function GuitarTunerPage() {
  return (
    <PdfToolLayout
      title="Guitar Tuner"
      icon="🎸"
      shellClassName="min-h-[100dvh] bg-gray-50 dark:bg-gray-950"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <GuitarTunerClient />
    </PdfToolLayout>
  );
}
