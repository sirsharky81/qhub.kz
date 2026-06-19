import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR метки ОС | QHub",
  description:
    "Этикетки для основных средств и оборудования — одна метка или массовая печать из базы 1С.",
  openGraph: {
    title: "QR метки ОС — одиночные и из базы 1С | QHub",
    description:
      "Формирование этикеток основных средств: одна метка или массовая печать из выгрузки 1С.",
    url: "https://qhub.kz/tools/qr-generator/inventory",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrInventoryPage() {
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
            initialType="inventory"
            seoTitleKey="seo.inventory.title"
            seoDescKey="seo.inventory.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
