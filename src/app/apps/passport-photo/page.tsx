import type { Metadata } from "next";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import PassportPhotoClient from "./PassportPhotoClient";

export const metadata: Metadata = {
  title: "Паспортное фото — QHub.kz",
  description:
    "Сделайте паспортное фото онлайн: обрезка по стандарту, замена фона на белый или светло-голубой, раскладка 1/4/6 фото на листе 10×15 для печати.",
};

const liveBadge = (
  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
    live
  </span>
);

export default function PassportPhotoPage() {
  return (
    <PdfToolLayout
      title="Паспортное фото"
      icon="📷"
      badge={liveBadge}
      shellClassName="h-screen bg-white"
    >
      <PassportPhotoClient />
    </PdfToolLayout>
  );
}
