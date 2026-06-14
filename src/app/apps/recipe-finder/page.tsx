import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import RecipeFinderClient from "./RecipeFinderClient";

export const metadata: Metadata = {
  title: "Что приготовить? — QHub.kz",
  description:
    "Введите список продуктов или сфотографируйте холодильник — ИИ предложит 5 блюд с подробными рецептами, калорийностью и временем приготовления.",
};

export default function RecipeFinderPage() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=4" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <div className="flex items-center gap-2">
          <Image
            src="/apps/meal-match-logo.png"
            alt="Meal Match"
            width={32}
            height={32}
            className="object-contain mix-blend-multiply"
          />
          <span className="text-sm font-medium text-gray-800">Meal Match</span>
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

      <RecipeFinderClient />
    </div>
  );
}
