import type { Metadata } from "next";
import { Suspense } from "react";
import MitsubishiDiagClient from "./MitsubishiDiagClient";

export const metadata: Metadata = {
  title: "Mitsubishi Diagnostics — блоки и OBD2 Live | QHub",
  description:
    "Диагностика блоков Mitsubishi: чтение и сброс ошибок, OBD2 Live, калибровки и тесты, датчики TPMS.",
  openGraph: {
    title: "Mitsubishi Diagnostics | QHub",
    url: "https://qhub.kz/tools/mitsubishi-diag",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function MitsubishiDiagPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-gray-50" />}>
      <MitsubishiDiagClient />
    </Suspense>
  );
}
