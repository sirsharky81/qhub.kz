import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR с реквизитами для оплаты | QHub",
  description:
    "Визитка с реквизитами для приёма платежей в QR-коде — для ручного копирования в банковское приложение. Локально в браузере.",
  openGraph: {
    title: "QR реквизиты | QHub",
    url: "https://qhub.kz/tools/qr-generator/payment",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrPaymentPage() {
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
            initialType="payment"
            seoTitleKey="seo.payment.title"
            seoDescKey="seo.payment.desc"
            disclaimerVariant="payment"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
