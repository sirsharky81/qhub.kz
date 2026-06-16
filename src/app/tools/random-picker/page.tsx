import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import RandomPickerClient from "./RandomPickerClient";

export const metadata: Metadata = {
  title:
    "QHub Random Picker — случайный выбор участников, жеребьёвка и генератор чисел",
  description:
    "Бесплатный инструмент для случайного выбора участников, жеребьёвок, распределения по группам, перемешивания списков и генерации случайных чисел. Без регистрации и полностью в браузере.",
  keywords: [
    "случайный выбор из списка",
    "жеребьёвка онлайн",
    "генератор случайных чисел",
    "random picker",
    "random selector",
    "randomizer",
    "shuffle list",
    "wheel picker",
    "group generator",
  ],
  openGraph: {
    title: "QHub Random Picker | QHub",
    description:
      "Случайный выбор участников, жеребьёвка и генератор чисел — полностью локально в браузере.",
    url: "https://qhub.kz/tools/random-picker",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QHub Random Picker",
  url: "https://qhub.kz/tools/random-picker",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  description:
    "Инструмент для случайного выбора участников, жеребьёвок, распределения по группам и генерации чисел — полностью в браузере.",
  provider: { "@type": "Organization", name: "QHub", url: "https://qhub.kz" },
};

const ICON = "/tools/random-picker/icon-192.png";

export default function RandomPickerPage() {
  return (
    <PdfToolLayout
      title="QHub Random Picker"
      iconSrc={ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white dark:bg-gray-950"
      badge={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <div className="flex flex-col flex-1 min-h-0 relative">
        <RandomPickerClient />
      </div>
    </PdfToolLayout>
  );
}
