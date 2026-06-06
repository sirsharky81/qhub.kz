"use client";

import {
  CuisineType,
  MealCategory,
  CUISINE_LABELS,
  MEAL_CATEGORY_LABELS,
} from "@/lib/recipe-finder/types";

interface Props {
  cuisine: CuisineType;
  category: MealCategory;
  onCuisineChange: (v: CuisineType) => void;
  onCategoryChange: (v: MealCategory) => void;
}

const CUISINES: CuisineType[] = [
  "any", "kazakh", "russian", "asian", "italian",
  "european", "american", "mediterranean", "indian",
];

const CATEGORIES: MealCategory[] = [
  "any", "breakfast", "lunch", "dinner", "snack", "dessert", "soup",
];

export default function FiltersBar({ cuisine, category, onCuisineChange, onCategoryChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Тип кухни
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CUISINES.map((c) => (
            <button
              key={c}
              onClick={() => onCuisineChange(c)}
              className={[
                "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                cuisine === c
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              ].join(" ")}
            >
              {CUISINE_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Категория блюда
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onCategoryChange(c)}
              className={[
                "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                category === c
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              ].join(" ")}
            >
              {CATEGORY_EMOJI[c]} {MEAL_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const CATEGORY_EMOJI: Record<MealCategory, string> = {
  any: "🍽️",
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🥨",
  dessert: "🍰",
  soup: "🍲",
};
