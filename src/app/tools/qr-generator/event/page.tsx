import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR события календаря (iCalendar) | QHub",
  description:
    "Создайте QR-код события в формате iCalendar — календарные приложения импортируют его напрямую.",
  openGraph: {
    title: "QR событие | QHub",
    url: "https://qhub.kz/tools/qr-generator/event",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrEventPage() {
  return (
    <PdfToolLayout
      title="QR-генератор"
      iconSrc={QR_ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <div className="flex flex-col flex-1 min-h-0 relative">
        <Suspense fallback={null}>
          <QrGeneratorClient
            initialType="event"
            seoTitleKey="seo.event.title"
            seoDescKey="seo.event.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
