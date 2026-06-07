"use client";

import { useEffect, useCallback, useState } from "react";
import { Recipe, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from "@/lib/recipe-finder/types";
import { exportRecipeToWord, printRecipe } from "@/lib/recipe-finder/export";

interface Props {
  recipe: Recipe;
  onClose: () => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  "Завтрак": "🌅",
  "Обед": "☀️",
  "Ужин": "🌙",
  "Перекус": "🥨",
  "Десерт": "🍰",
  "Суп": "🍲",
};

const CUISINE_GRADIENT: Record<string, string> = {
  "Казахская":        "from-amber-600 to-yellow-500",
  "Русская":          "from-blue-700 to-blue-500",
  "Азиатская":        "from-red-600 to-orange-500",
  "Итальянская":      "from-green-600 to-emerald-500",
  "Европейская":      "from-indigo-600 to-blue-500",
  "Американская":     "from-red-600 to-red-400",
  "Средиземноморская":"from-cyan-600 to-teal-500",
  "Индийская":        "from-orange-600 to-yellow-500",
};

function getGradient(cuisine: string): string {
  for (const key of Object.keys(CUISINE_GRADIENT)) {
    if (cuisine.toLowerCase().includes(key.toLowerCase())) return CUISINE_GRADIENT[key];
  }
  return "from-gray-700 to-gray-500";
}

function getCategoryEmoji(category: string): string {
  for (const key of Object.keys(CATEGORY_EMOJI)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return CATEGORY_EMOJI[key];
  }
  return "🍽️";
}

export default function RecipeModal({ recipe, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [handleEsc]);

  async function handleExportWord() {
    try {
      await exportRecipeToWord(recipe);
    } catch (e) {
      console.error("Export error:", e);
      alert("Не удалось экспортировать рецепт");
    }
  }

  function buildShareText(): string {
    const diffMap: Record<string, string> = { easy: "Легко", medium: "Средне", hard: "Сложно" };
    const lines: string[] = [
      `🍳 *${recipe.title}*`,
      `_${recipe.description}_`,
      "",
      `⏱ ${recipe.cookingTime} мин · 🔥 ${recipe.calories} ккал · 📊 ${diffMap[recipe.difficulty] ?? recipe.difficulty} · 👥 ${recipe.servings} порц.`,
      `🌍 ${recipe.cuisine} · ${recipe.category}`,
      "",
      "🛒 *Ингредиенты:*",
      ...recipe.ingredients.map((i) => `• ${i.name} — ${i.amount}`),
      "",
      "👨‍🍳 *Приготовление:*",
      ...recipe.steps.map((s, idx) => `${idx + 1}. ${s}`),
      "",
      "📲 _Найдено с помощью Meal Match на QHub.kz_",
    ];
    return lines.join("\n");
  }

  async function handleNativeShare() {
    const text = buildShareText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: recipe.title, text });
      } catch { /* user cancelled */ }
    }
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`, "_blank");
  }

  function handleTelegram() {
    window.open(`https://t.me/share/url?url=https://qhub.kz&text=${encodeURIComponent(buildShareText())}`, "_blank");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Не удалось скопировать");
    }
  }

  const hasNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const gradient = getGradient(recipe.cuisine);
  const emoji = getCategoryEmoji(recipe.category);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden rounded-t-3xl">

        {/* Hero header — gradient + emoji */}
        <div className={`flex-shrink-0 relative bg-gradient-to-br ${gradient} p-6 pb-5`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors text-lg"
          >
            ×
          </button>

          <div className="flex items-end gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 shadow-inner">
              <span className="text-5xl">{emoji}</span>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={["px-2 py-0.5 text-[10px] font-semibold rounded-full border", DIFFICULTY_COLORS[recipe.difficulty]].join(" ")}>
                  {DIFFICULTY_LABELS[recipe.difficulty]}
                </span>
                <span className="text-[11px] text-white/70">{recipe.cuisine} · {recipe.category}</span>
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">{recipe.title}</h2>
              <p className="text-sm text-white/75 mt-1 leading-relaxed line-clamp-2">{recipe.description}</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex-shrink-0 grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { emoji: "⏱", label: "Время",     value: `${recipe.cookingTime} мин` },
            { emoji: "🔥", label: "Калории",   value: `${recipe.calories} ккал/порц.` },
            { emoji: "👥", label: "Порций",    value: String(recipe.servings) },
            { emoji: "📊", label: "Сложность", value: DIFFICULTY_LABELS[recipe.difficulty] },
          ].map(({ emoji: e, label, value }) => (
            <div key={label} className="flex flex-col items-center justify-center py-3 px-2">
              <span className="text-lg mb-0.5">{e}</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
              <span className="text-sm font-semibold text-gray-800">{value}</span>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>🛒</span> Ингредиенты
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0">
              {recipe.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50">
                  <span className="text-xs text-gray-800 truncate mr-2">{ing.name}</span>
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{ing.amount}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>👨‍🍳</span> Приготовление
            </h3>
            <div className="space-y-3">
              {recipe.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Share panel */}
        {showShareMenu && (
          <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-2 bg-white">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-2">Поделиться через</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { handleWhatsApp(); setShowShareMenu(false); }}
                className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#1fba58] text-white rounded-xl text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.532 5.845L.057 23.487a.5.5 0 0 0 .609.61l5.733-1.497A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.877 9.877 0 0 1-5.031-1.378l-.361-.214-3.741.979.999-3.648-.235-.374A9.867 9.867 0 0 1 2.1 12c0-5.457 4.443-9.9 9.9-9.9s9.9 4.443 9.9 9.9-4.443 9.9-9.9 9.9z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={() => { handleTelegram(); setShowShareMenu(false); }}
                className="flex items-center gap-2 px-4 py-2 bg-[#2AABEE] hover:bg-[#1a9bde] text-white rounded-xl text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Telegram
              </button>
              <button
                onClick={() => { handleCopy(); setShowShareMenu(false); }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                <span>{copied ? "✓" : "📋"}</span>
                {copied ? "Скопировано!" : "Копировать"}
              </button>
              {hasNativeShare && (
                <button
                  onClick={() => { handleNativeShare(); setShowShareMenu(false); }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <span>↗</span> Ещё приложения
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 flex items-center gap-2 bg-gray-50/50">
          <button
            onClick={() => setShowShareMenu((v) => !v)}
            className={["flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors border",
              showShareMenu ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400",
            ].join(" ")}
          >
            <span>↗</span> Поделиться
          </button>
          <button
            onClick={handleExportWord}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <span>📄</span> Word
          </button>
          <button
            onClick={() => printRecipe(recipe)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 hover:border-gray-400 text-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            <span>🖨️</span> Печать
          </button>
        </div>
      </div>
    </div>
  );
}
