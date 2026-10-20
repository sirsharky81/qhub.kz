import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";
import "./etacs-coding.css";
import EtacsCodingClient from "./EtacsCodingClient";

export const metadata: Metadata = {
  title: "ETACS Coding — редактор .kon и .cuf | QHub",
  description:
    "Редактирование и сравнение кодировок Mitsubishi ETACS (.kon / .cuf) с серверным справочником MUT. Совместимо с MMCodingWriter.",
  openGraph: {
    title: "QHub ETACS Coding",
    url: "https://qhub.kz/tools/etacs-coding",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const ICON = "/tools/obd-diag/icon-192.png";

export default function EtacsCodingPage() {
  return (
    <PdfToolLayout
      title="ETACS Coding"
      iconSrc={ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-gray-50"
      badge={false}
      lightHeader
    >
      <Suspense fallback={<div className="mx-auto h-40 max-w-lg animate-pulse rounded-xl bg-gray-200/80" />}>
        <EtacsCodingClient />
      </Suspense>
    </PdfToolLayout>
  );
}
