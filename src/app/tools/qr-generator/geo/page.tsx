import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR геопозиции онлайн | QHub",
  description:
    "Создайте QR-код с координатами geo:широта,долгота — после сканирования откроется точка на карте. Локально в браузере.",
  keywords: ["qr геолокация", "qr координаты", "geo qr code", "qr карта"],
  openGraph: {
    title: "Geolocation QR | QHub",
    url: "https://qhub.kz/tools/qr-generator/geo",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrGeoPage() {
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
            initialType="geo"
            seoTitleKey="seo.geo.title"
            seoDescKey="seo.geo.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
