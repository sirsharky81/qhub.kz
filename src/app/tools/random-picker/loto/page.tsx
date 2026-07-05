import type { Metadata } from "next";
import { Suspense } from "react";
import { PdfToolLayout } from "../../_pdf-shared/PdfToolLayout";
import LottoClient from "./LottoClient";

export const metadata: Metadata = {
  title: "Русское лото — электронный ведущий 1–90 | Генератор случайных чисел",
  description:
    "Русское лото онлайн: случайные бочки от 1 до 90 без повторений, озвучка, автоматическая выдача и история. Полностью в браузере, без регистрации.",
  keywords: [
    "русское лото онлайн",
    "бочки лото",
    "лото 1-90",
    "генератор лото",
    "электронный ведущий лото",
  ],
  openGraph: {
    title: "Русское лото | QHub",
    description: "Замена мешка и бочек для игры в лото — локально в браузере.",
    url: "https://qhub.kz/tools/random-picker/loto",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

const ICON = "/tools/random-picker/icon-192.png";

export default function LottoPage() {
  return (
    <PdfToolLayout
      title="Русское лото"
      iconSrc={ICON}
      shellClassName="min-h-[100dvh] flex flex-col bg-white dark:bg-gray-950"
      badge={false}
    >
      <div className="flex flex-col flex-1 min-h-0 relative">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">
              Загрузка…
            </div>
          }
        >
          <LottoClient />
        </Suspense>
      </div>
    </PdfToolLayout>
  );
}
