"use client";

import { Recipe, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from "@/lib/recipe-finder/types";

interface Props {
  recipe: Recipe;
  index: number;
  onClick: () => void;
}

export default function RecipeCard({ recipe, index, onClick }: Props) {
  const matchCount = recipe.usedIngredients.length;
  const missingCount = recipe.missingIngredients.length;

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-400 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 group-hover:bg-gray-900 group-hover:text-white transition-colors flex-shrink-0">
            {index + 1}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-tight group-hover:text-gray-700">
            {recipe.title}
          </h3>
        </div>
        <span
          className={[
            "flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border",
            DIFFICULTY_COLORS[recipe.difficulty],
          ].join(" ")}
        >
          {DIFFICULTY_LABELS[recipe.difficulty]}
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
        {recipe.description}
      </p>

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
        <span className="flex items-center gap-1">
          <span>⏱</span> {recipe.cookingTime} мин
        </span>
        <span className="text-gray-300">•</span>
        <span className="flex items-center gap-1">
          <span>🔥</span> {recipe.calories} ккал
        </span>
        <span className="text-gray-300">•</span>
        <span className="flex items-center gap-1">
          <span>👥</span> {recipe.servings} порц.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-1">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{
                width: `${matchCount + missingCount > 0 ? (matchCount / (matchCount + missingCount)) * 100 : 100}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {matchCount} из {matchCount + missingCount} ингр.
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <span>{recipe.cuisine}</span>
          <span>•</span>
          <span>{recipe.category}</span>
        </div>
      </div>

      {missingCount > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-[11px] text-amber-600">
            Не хватает: {recipe.missingIngredients.slice(0, 3).join(", ")}
            {missingCount > 3 && ` и ещё ${missingCount - 3}`}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end text-xs text-gray-400 group-hover:text-gray-600 transition-colors">
        Посмотреть рецепт →
      </div>
    </button>
  );
}
