import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import QrGeneratorClient from "../QrGeneratorClient";

export const metadata: Metadata = {
  title: "QR для Wi-Fi онлайн | QHub",
  description:
    "Создайте QR-код для подключения гостей к Wi-Fi без диктовки пароля. Поддержка скрытых сетей (Hidden SSID).",
  openGraph: {
    title: "Wi-Fi QR | QHub",
    url: "https://qhub.kz/tools/qr-generator/wifi",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function QrWifiPage() {
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
            initialType="wifi"
            seoTitleKey="seo.wifi.title"
            seoDescKey="seo.wifi.desc"
          />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
