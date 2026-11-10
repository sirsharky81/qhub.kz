import type { Metadata } from "next";
import { Suspense } from "react";
import SubaruCodingClient from "./SubaruCodingClient";

export const metadata: Metadata = {
  title: "Subaru Coding & Immobilizer — Приборка (°C / км/ч) и Ключи | QHub",
  description:
    "Кодирование приборной панели Subaru (°F → °C, 12-колоночный код) и функции иммобилайзера SSM4 F2: чтение ключей, прописка ключей и регистрация Remote Engine Start.",
  openGraph: {
    title: "Subaru Coding & Immobilizer | QHub",
    url: "https://qhub.kz/tools/subaru-coding",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function SubaruCodingPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-gray-50" />}>
      <SubaruCodingClient />
    </Suspense>
  );
}
