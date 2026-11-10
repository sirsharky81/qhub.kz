import type { Metadata } from "next";
import { Suspense } from "react";
import ObdDiagClient from "./ObdDiagClient";

export const metadata: Metadata = {
  title: "Subaru Diagnostics — SSM4, OBD2 Live и CAN/UDS | QHub",
  description:
    "Диагностика Subaru (SSM4) через vLinker BLE: чтение и сброс ошибок по 40 системам, Data Monitor, сервисные калибровки .srp, OBD2 Live и CAN/UDS.",
  openGraph: {
    title: "Subaru Diagnostics | QHub",
    url: "https://qhub.kz/tools/obd-diag",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function ObdDiagPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-gray-50" />}>
      <ObdDiagClient mode="subaru" />
    </Suspense>
  );
}
