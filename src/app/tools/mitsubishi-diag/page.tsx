import type { Metadata } from "next";
import { Suspense } from "react";
import MitsubishiDiagClient from "./MitsubishiDiagClient";

export const metadata: Metadata = {
  title: "Mitsubishi Diagnostics — MUT-III, OBD2 Live и ETACS | QHub",
  description:
    "Диагностика Mitsubishi через vLinker BLE: OBD2 Live-параметры, ошибки и блоки MUT-III, калибровка угла руля SAS, датчики TPMS и выгрузка/запись Mitsubishi ETACS (.kon / .cuf).",
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
