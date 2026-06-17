import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR для WhatsApp онлайн бесплатно | QHub",
  description:
    "Создайте QR-код для WhatsApp: номер телефона и предзаполненное сообщение. Удобно для малого бизнеса в Казахстане — локально в браузере.",
  keywords: ["qr whatsapp", "qr код whatsapp", "whatsapp qr generator", "qr для бизнеса"],
  openGraph: {
    title: "WhatsApp QR | QHub",
    url: "https://qhub.kz/tools/qr-generator/whatsapp",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrWhatsAppPage() {
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
            initialType="whatsapp"
            seoTitleKey="seo.whatsapp.title"
            seoDescKey="seo.whatsapp.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
