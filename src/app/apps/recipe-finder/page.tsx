import type { Metadata } from "next";
import Image from "next/image";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import RecipeFinderClient from "./RecipeFinderClient";

export const metadata: Metadata = {
  title: "Что приготовить? — QHub.kz",
  description:
    "Введите список продуктов или сфотографируйте холодильник — ИИ предложит 5 блюд с подробными рецептами, калорийностью и временем приготовления.",
};

const liveBadge = (
  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
    live
  </span>
);

const mealMatchIcon = (
  <Image
    src="/apps/meal-match-logo.png"
    alt=""
    width={20}
    height={20}
    className="object-contain mix-blend-multiply shrink-0"
  />
);

export default function RecipeFinderPage() {
  return (
    <PdfToolLayout
      title="Meal Match"
      titleIcon={mealMatchIcon}
      badge={liveBadge}
      shellClassName="h-screen bg-gray-50"
    >
      <RecipeFinderClient />
    </PdfToolLayout>
  );
}
