"use client";

import { useState, KeyboardEvent } from "react";

interface Props {
  ingredients: string[];
  onChange: (ingredients: string[]) => void;
}

export default function IngredientsInput({ ingredients, onChange }: Props) {
  const [inputValue, setInputValue] = useState("");

  function addIngredient(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const unique = parts.filter((p) => !ingredients.includes(p));
    if (unique.length > 0) {
      onChange([...ingredients, ...unique]);
    }
    setInputValue("");
  }

  function removeIngredient(index: number) {
    onChange(ingredients.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addIngredient(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && ingredients.length > 0) {
      onChange(ingredients.slice(0, -1));
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="min-h-[100px] w-full border border-gray-200 rounded-xl p-3 focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-300 transition-all bg-white"
        onClick={() => document.getElementById("ingredient-input")?.focus()}
      >
        <div className="flex flex-wrap gap-2 mb-2">
          {ingredients.map((ing, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium border border-gray-200"
            >
              {ing}
              <button
                onClick={(e) => { e.stopPropagation(); removeIngredient(i); }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors text-xs"
                aria-label={`Удалить ${ing}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          id="ingredient-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addIngredient(inputValue)}
          placeholder={ingredients.length === 0 ? "Введите ингредиент и нажмите Enter..." : "Добавить ещё..."}
          className="w-full outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
        />
      </div>

      <div className="flex items-start gap-2">
        <p className="text-xs text-gray-400 flex-1">
          Нажмите Enter или запятую после каждого ингредиента. Можно вставить список через запятую.
        </p>
        {ingredients.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-xs text-red-400 hover:text-red-600 transition-colors whitespace-nowrap"
          >
            Очистить всё
          </button>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Быстрое добавление:</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_INGREDIENTS.filter((q) => !ingredients.includes(q)).slice(0, 12).map((q) => (
            <button
              key={q}
              onClick={() => onChange([...ingredients, q])}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-full text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              + {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const QUICK_INGREDIENTS = [
  "Яйца", "Молоко", "Масло сливочное", "Мука", "Сахар", "Соль",
  "Картофель", "Лук", "Морковь", "Чеснок", "Помидоры", "Огурцы",
  "Куриное филе", "Говядина", "Свинина", "Фарш", "Рис", "Макароны",
  "Гречка", "Сыр", "Сметана", "Кефир", "Творог", "Капуста",
];
