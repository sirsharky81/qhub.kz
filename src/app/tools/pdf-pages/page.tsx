import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import PdfPagesClient from "./PdfPagesClient";

export const metadata: Metadata = {
  title: "PDF Pages — редактор страниц PDF онлайн | QHub",
  description:
    "Удалите, переставьте, поверните или извлеките страницы из PDF прямо в браузере. Бесплатно, без регистрации, без установки программ.",
  keywords: [
    "удалить страницы из PDF",
    "объединить PDF",
    "разделить PDF",
    "изменить порядок страниц PDF",
    "PDF редактор онлайн",
    "PDF бесплатно онлайн",
  ],
  openGraph: {
    title: "PDF Pages | QHub",
    description:
      "Редактируй страницы PDF онлайн — удаляй, перемещай, поворачивай, объединяй и разделяй.",
    url: "https://qhub.kz/tools/pdf-pages",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Как удалить страницу из PDF?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Загрузите PDF, выберите ненужные страницы и нажмите «Удалить». Можно указать диапазон вроде 1-3,7.",
      },
    },
    {
      "@type": "Question",
      name: "Безопасно ли загружать документы?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Да. Весь PDF обрабатывается локально в браузере. Файлы не отправляются на сервер.",
      },
    },
    {
      "@type": "Question",
      name: "Есть ли ограничения на размер файла?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Сервис рассчитан на документы до 500 страниц и 100 МБ.",
      },
    },
    {
      "@type": "Question",
      name: "Как объединить несколько PDF?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Нажмите «Объединить», выберите несколько PDF-файлов и скачайте результат.",
      },
    },
    {
      "@type": "Question",
      name: "Как разделить PDF на части?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Откройте режим «Разделить» — каждая страница отдельно или по диапазону.",
      },
    },
    {
      "@type": "Question",
      name: "Работает ли сервис на телефоне?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Да, интерфейс адаптирован для мобильных устройств.",
      },
    },
    {
      "@type": "Question",
      name: "Нужна ли регистрация?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Нет. PDF Pages бесплатен и не требует аккаунта.",
      },
    },
    {
      "@type": "Question",
      name: "Сервис бесплатный?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Да, все функции доступны бесплатно.",
      },
    },
  ],
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PDF Pages",
  url: "https://qhub.kz/tools/pdf-pages",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KZT",
  },
  description:
    "Онлайн-редактор страниц PDF: удаление, сортировка, поворот, объединение и разделение в браузере.",
  provider: {
    "@type": "Organization",
    name: "QHub",
    url: "https://qhub.kz",
  },
};

export default async function PdfPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: "merge" | "split" | "extract" }>;
}) {
  const params = await searchParams;

  return (
    <PdfToolLayout title="PDF Pages" icon="📄">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <PdfPagesClient initialAction={params.action} />
    </PdfToolLayout>
  );
}
