import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR визитка (vCard) онлайн | QHub",
  description:
    "Создайте QR-код с контактной визиткой vCard для быстрого обмена контактами — локально в браузере.",
  openGraph: {
    title: "QR vCard | QHub",
    url: "https://qhub.kz/tools/qr-generator/vcard",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrVcardPage() {
  return (
    <PdfToolLayout
      title="QR-генератор"
      iconSrc={QR_ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <div className="flex flex-col flex-1 min-h-0 relative">
        <Suspense fallback={null}>
          <QrGeneratorClient initialType="vcard" seoTitleKey="seo.vcard.title" seoDescKey="seo.vcard.desc" />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
