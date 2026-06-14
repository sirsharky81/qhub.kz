import type { Metadata } from "next";
import Link from "next/link";
import PassportPhotoClient from "./PassportPhotoClient";

export const metadata: Metadata = {
  title: "Паспортное фото — QHub.kz",
  description:
    "Сделайте паспортное фото онлайн: обрезка по стандарту, замена фона на белый или светло-голубой, раскладка 1/4/6 фото на листе 10×15 для печати.",
};

export default function PassportPhotoPage() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=3" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <div className="flex items-center gap-1.5">
          <span className="text-base">📷</span>
          <span className="text-sm font-medium text-gray-800">Паспортное фото</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
            live
          </span>
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors hidden sm:block"
          >
            ← Все приложения
          </Link>
        </div>
      </div>

      <PassportPhotoClient />
    </div>
  );
}
