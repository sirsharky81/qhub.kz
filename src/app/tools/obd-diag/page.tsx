import type { Metadata } from "next";
import { Suspense } from "react";
import ObdDiagClient from "./ObdDiagClient";

export const metadata: Metadata = {
  title: "OBD Scanner BLE — коды и параметры | QHub",
  description:
    "Универсальный OBD-II через vLinker BLE: коды ошибок, live-параметры, CAN-монитор и UDS. Отдельно — выгрузка Mitsubishi ETACS (.kon / .cuf).",
  openGraph: {
    title: "QHub OBD Scanner",
    url: "https://qhub.kz/tools/obd-diag",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function ObdDiagPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-gray-50" />}>
      <ObdDiagClient />
    </Suspense>
  );
}
