import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR для Telegram онлайн бесплатно | QHub",
  description:
    "Создайте QR-код со ссылкой на профиль или чат Telegram. Быстрый обмен для бизнеса и личного использования — локально в браузере.",
  keywords: ["qr telegram", "qr код telegram", "telegram qr generator", "t.me qr"],
  openGraph: {
    title: "Telegram QR | QHub",
    url: "https://qhub.kz/tools/qr-generator/telegram",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrTelegramPage() {
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
            initialType="telegram"
            seoTitleKey="seo.telegram.title"
            seoDescKey="seo.telegram.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
