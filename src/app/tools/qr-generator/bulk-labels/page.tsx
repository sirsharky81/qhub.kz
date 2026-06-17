import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import BulkLabelsClient from "./BulkLabelsClient";

export const metadata: Metadata = {
  title: "Массовая печать QR-этикеток | QHub",
  description:
    "Сгенерируйте PDF с сеткой QR или штрихкодов для списка BOX-001…100 — локально в браузере.",
  keywords: ["массовая печать qr", "этикетки qr", "bulk qr labels", "склад этикетки"],
  openGraph: {
    title: "Bulk QR labels | QHub",
    url: "https://qhub.kz/tools/qr-generator/bulk-labels",
  },
};

const QR_ICON = "/tools/qr-generator/icon-192.png";

export default function BulkLabelsPage() {
  return (
    <PdfToolLayout
      title="QR-генератор"
      iconSrc={QR_ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white"
      badge={false}
    >
      <Suspense fallback={null}>
        <BulkLabelsClient />
      </Suspense>
    </PdfToolLayout>
  );
}
