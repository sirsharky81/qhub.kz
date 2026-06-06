"use client";

import { useState } from "react";
import IngredientsInput from "@/components/recipe-finder/IngredientsInput";
import PhotoCapture from "@/components/recipe-finder/PhotoCapture";
import FiltersBar from "@/components/recipe-finder/FiltersBar";
import RecipeCard from "@/components/recipe-finder/RecipeCard";
import RecipeModal from "@/components/recipe-finder/RecipeModal";
import { Recipe, CuisineType, MealCategory } from "@/lib/recipe-finder/types";

type InputTab = "text" | "photo";

export default function RecipeFinderClient() {
  const [tab, setTab] = useState<InputTab>("text");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState<CuisineType>("any");
  const [category, setCategory] = useState<MealCategory>("any");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  async function handleGenerate() {
    if (ingredients.length === 0) return;
    setError(null);
    setIsGenerating(true);
    setRecipes([]);

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients, cuisine, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сгенерировать рецепты");
        return;
      }
      setRecipes(data.recipes || []);
    } catch {
      setError("Ошибка соединения. Проверьте интернет и попробуйте снова.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePhotoIngredients(found: string[]) {
    setIngredients((prev) => {
      const merged = [...prev];
      found.forEach((ing) => {
        if (!merged.includes(ing)) merged.push(ing);
      });
      return merged;
    });
    setTab("text");
  }

  const canGenerate = ingredients.length > 0 && !isGenerating && !isAnalyzingPhoto;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6">

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex border-b border-gray-100">
            {(["text", "photo"] as InputTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                  tab === t
                    ? "text-gray-900 border-b-2 border-gray-900 -mb-px bg-white"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t === "text" ? (
                  <><span>📝</span> Список продуктов</>
                ) : (
                  <><span>📸</span> Фото холодильника</>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "text" ? (
              <IngredientsInput ingredients={ingredients} onChange={setIngredients} />
            ) : (
              <PhotoCapture
                onIngredientsFound={handlePhotoIngredients}
                onLoading={setIsAnalyzingPhoto}
                isLoading={isAnalyzingPhoto}
              />
            )}
          </div>

          <div className="px-4 pb-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors py-1"
            >
              <span className={`transition-transform ${showFilters ? "rotate-180" : ""}`}>▾</span>
              {showFilters ? "Скрыть фильтры" : "Фильтры: кухня и категория"}
              {(cuisine !== "any" || category !== "any") && (
                <span className="ml-1 w-2 h-2 rounded-full bg-blue-500 inline-block" />
              )}
            </button>
          </div>

          {showFilters && (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              <FiltersBar
                cuisine={cuisine}
                category={category}
                onCuisineChange={setCuisine}
                onCategoryChange={setCategory}
              />
            </div>
          )}

          <div className="px-4 pb-4">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={[
                "w-full py-3 rounded-xl text-sm font-semibold transition-all",
                canGenerate
                  ? "bg-gray-900 hover:bg-gray-700 text-white shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed",
              ].join(" ")}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Подбираю рецепты...
                </span>
              ) : (
                `🍳 Подобрать блюда${ingredients.length > 0 ? ` (${ingredients.length} ингр.)` : ""}`
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-medium text-red-800">Ошибка</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-36 bg-gray-50 border border-gray-100 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        )}

        {recipes.length > 0 && !isGenerating && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Найдено блюд: {recipes.length}
              </h2>
              <button
                onClick={handleGenerate}
                className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
              >
                🔄 Другие варианты
              </button>
            </div>

            {recipes.map((recipe, i) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                index={i}
                onClick={() => setSelectedRecipe(recipe)}
              />
            ))}
          </div>
        )}

        {recipes.length === 0 && !isGenerating && !error && (
          <div className="text-center py-12 space-y-3">
            <div className="text-5xl">🥗</div>
            <p className="text-sm text-gray-500">
              Введите ингредиенты или сфотографируйте холодильник
            </p>
            <p className="text-xs text-gray-400">
              ИИ подберёт 5 блюд, которые можно приготовить
            </p>
          </div>
        )}
      </div>

      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  );
}
