import type { Metadata } from "next";
import { Suspense } from "react";
import SubaruCodingClient from "./SubaruCodingClient";

export const metadata: Metadata = {
  title: "Subaru Coding & Immobilizer — °F → °C и ключи | QHub",
  description:
    "Перевод показаний Subaru с °F на °C и иммобилайзер: чтение ключей, прописка ключей и регистрация RES.",
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
