import type { Metadata } from "next";
import MitsubishiDiagClient from "./MitsubishiDiagClient";

export const metadata: Metadata = {
  title: "Mitsubishi OBD и ETACS — vLinker BLE | QHub",
  description:
    "Подключение vLinker BLE, коды ошибок OBD, live-параметры и выгрузка coding .kon / .cuf для Mitsubishi ETACS.",
  openGraph: {
    title: "Mitsubishi OBD / ETACS — QHub",
    url: "https://qhub.kz/tools/mitsubishi-diag",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function MitsubishiDiagPage() {
  return <MitsubishiDiagClient />;
}
