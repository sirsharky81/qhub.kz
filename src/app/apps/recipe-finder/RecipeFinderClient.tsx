"use client";

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import PhotoCapture from "@/components/recipe-finder/PhotoCapture";
import FiltersBar from "@/components/recipe-finder/FiltersBar";
import RecipeCard from "@/components/recipe-finder/RecipeCard";
import RecipeModal from "@/components/recipe-finder/RecipeModal";
import { Recipe, CuisineType, MealCategory } from "@/lib/recipe-finder/types";

const QUICK_INGREDIENTS = [
  "Яйца", "Молоко", "Масло сливочное", "Мука", "Картофель", "Лук",
  "Морковь", "Чеснок", "Помидоры", "Огурцы", "Сыр", "Сметана",
  "Куриное филе", "Говядина", "Фарш", "Рис", "Макароны", "Гречка",
  "Творог", "Кефир", "Капуста", "Перец болгарский", "Грибы", "Колбаса",
];

const PLACEHOLDERS = [
  "яйца, картошка, лук, сыр...",
  "хочу что-то на ужин за 30 минут",
  "борщ",
  "лёгкий завтрак без глютена",
  "паста карбонара",
  "что приготовить из куриного филе?",
  "быстрый перекус из того, что есть",
];

export default function RecipeFinderClient() {
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<CuisineType>("any");
  const [category, setCategory] = useState<MealCategory>("any");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [intentLabel, setIntentLabel] = useState<string | null>(null);
  const [strictIngredients, setStrictIngredients] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!query.trim()) return;
    setError(null);
    setIsGenerating(true);
    setRecipes([]);
    setIntentLabel(null);

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), cuisine, category, strictIngredients }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось подобрать рецепты");
        return;
      }
      setRecipes(data.recipes || []);
      if (data.intent) {
        const labels: Record<string, string> = {
          ingredients: "По ингредиентам",
          dish: "По названию блюда",
          wish: "По пожеланию",
          mixed: "Комбинированный запрос",
        };
        setIntentLabel(labels[data.intent] ?? null);
      }
    } catch {
      setError("Ошибка соединения. Проверьте интернет и попробуйте снова.");
    } finally {
      setIsGenerating(false);
    }
  }, [query, cuisine, category]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  }

  function handlePhotoIngredients(found: string[]) {
    setQuery(found.join(", "));
    setShowPhoto(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  const canGenerate = query.trim().length > 0 && !isGenerating && !isAnalyzingPhoto;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-4">

        {/* Smart input card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 pb-3">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                placeholder={PLACEHOLDERS[placeholderIdx]}
                className="w-full resize-none text-sm text-gray-800 placeholder-gray-300 bg-transparent outline-none leading-relaxed pr-10"
              />
              {/* photo button inside textarea */}
              <button
                onClick={() => setShowPhoto((v) => !v)}
                title="Сфотографировать холодильник"
                className={[
                  "absolute top-0 right-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-base",
                  showPhoto
                    ? "bg-gray-900 text-white"
                    : "text-gray-300 hover:text-gray-600 hover:bg-gray-50",
                ].join(" ")}
              >
                📸
              </button>
              {query.length > 0 && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute bottom-0 right-0 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-500 transition-colors text-lg"
                >
                  ×
                </button>
              )}
            </div>

            {/* Example chips — when empty */}
            {query.length === 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["яйца, картошка, лук", "борщ", "ужин за 30 минут", "лёгкий завтрак"].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setQuery(ex); textareaRef.current?.focus(); }}
                    className="px-2.5 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded-full text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {/* Quick ingredients */}
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Быстрое добавление
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_INGREDIENTS
                  .filter((q) => !query.toLowerCase().includes(q.toLowerCase()))
                  .slice(0, 16)
                  .map((ing) => (
                    <button
                      key={ing}
                      onClick={() => {
                        setQuery((prev) => {
                          const trimmed = prev.trimEnd();
                          if (!trimmed) return ing;
                          return trimmed.endsWith(",") ? `${trimmed} ${ing}` : `${trimmed}, ${ing}`;
                        });
                        textareaRef.current?.focus();
                      }}
                      className="px-2.5 py-1 text-[11px] border border-gray-200 rounded-full text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      + {ing}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Photo capture panel */}
          {showPhoto && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-3">
                Сфотографируйте холодильник — ИИ определит продукты и добавит в поиск
              </p>
              <PhotoCapture
                onIngredientsFound={handlePhotoIngredients}
                onLoading={setIsAnalyzingPhoto}
                isLoading={isAnalyzingPhoto}
              />
            </div>
          )}

          {/* Filters toggle */}
          <div className="px-4 pb-2 flex items-center gap-3 border-t border-gray-50">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors py-2"
            >
              <span className={`transition-transform text-[10px] ${showFilters ? "rotate-180" : ""}`}>▾</span>
              Фильтры
              {(cuisine !== "any" || category !== "any") && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              )}
            </button>
            <span className="text-gray-200 text-xs hidden sm:inline">|</span>
            <p className="text-xs text-gray-400 italic hidden sm:block">
              Enter — найти · Shift+Enter — новая строка · 📸 — фото
            </p>
            <p className="text-xs text-gray-400 italic sm:hidden">
              📸 — сфото холодильник
            </p>
          </div>

          {showFilters && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <FiltersBar
                cuisine={cuisine}
                category={category}
                onCuisineChange={setCuisine}
                onCategoryChange={setCategory}
              />
            </div>
          )}

          {/* Ingredients mode toggle */}
          <div className="mx-4 mb-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <button
              onClick={() => setStrictIngredients((v) => !v)}
              className="flex items-center gap-3 w-full text-left"
            >
              {/* toggle track — ON (black) = allow extras = !strictIngredients */}
              <div className={[
                "relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200",
                !strictIngredients ? "bg-gray-900" : "bg-gray-300",
              ].join(" ")}>
                <span className={[
                  "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                  !strictIngredients ? "left-5" : "left-1",
                ].join(" ")} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={["text-xs font-semibold", !strictIngredients ? "text-gray-900" : "text-gray-400"].join(" ")}>
                  {!strictIngredients
                    ? "Добавлять ингредиенты не из списка"
                    : "Строго по списку продуктов"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                  {!strictIngredients
                    ? "ИИ может использовать дополнительные продукты"
                    : "Только то, что есть — без лишних покупок"}
                </p>
              </div>
            </button>
          </div>

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
                "🍳 Найти рецепты"
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-medium text-red-800">Ошибка</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Skeletons */}
        {isGenerating && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-36 bg-gray-50 border border-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Results */}
        {recipes.length > 0 && !isGenerating && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">
                  Найдено: {recipes.length} блюд
                </h2>
                {intentLabel && (
                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">
                    {intentLabel}
                  </span>
                )}
              </div>
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

        {/* Empty state */}
        {recipes.length === 0 && !isGenerating && !error && (
          <div className="text-center py-12 space-y-3">
            <div className="text-5xl">🥗</div>
            <p className="text-sm font-medium text-gray-600">Что хочешь приготовить?</p>
            <div className="text-xs text-gray-400 space-y-1">
              <p>Напиши название блюда, список продуктов</p>
              <p>или просто пожелание — ИИ сам разберётся</p>
            </div>
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
