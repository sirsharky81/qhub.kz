import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR для коробки / ячейки хранения | QHub",
  description:
    "Маркировка коробок и ячеек со списком содержимого — для дома, гаража и склада. Импорт из Excel.",
  openGraph: {
    title: "Storage box QR | QHub",
    url: "https://qhub.kz/tools/qr-generator/storage",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrStoragePage() {
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
            initialType="storage"
            seoTitleKey="seo.storage.title"
            seoDescKey="seo.storage.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
