"use client";

import { useState } from "react";
import {
  CATALOG_CATEGORIES,
  getCatalogByCategory,
  type CatalogCategoryId,
  type CatalogEntry,
} from "@/lib/file-converter/conversion-catalog";
import type { ActionId } from "@/lib/file-converter/types";
import { CategoryIcon } from "./CategoryIcon";

interface ConversionCatalogProps {
  selectedEntryId?: string;
  onSelectAction: (actionId: ActionId, entry: CatalogEntry) => void;
  onOpenPwaTab?: () => void;
}

export function ConversionCatalog({
  selectedEntryId,
  onSelectAction,
  onOpenPwaTab,
}: ConversionCatalogProps) {
  const [activeCategory, setActiveCategory] = useState<CatalogCategoryId>("all");

  const entries = getCatalogByCategory(activeCategory);
  const grouped =
    activeCategory === "all"
      ? CATALOG_CATEGORIES.filter((c) => c.id !== "all").map((cat) => ({
          category: cat,
          items: getCatalogByCategory(cat.id),
        }))
      : null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-mono">
          Каталог конвертаций
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Выберите категорию — ниже появятся форматы «из → в» и подсказки, какой файл загрузить.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {CATALOG_CATEGORIES.map((cat) => {
          const active = activeCategory === cat.id;
          const displayLabel = cat.shortLabel ? (
            <>
              <span className="sm:hidden">{cat.shortLabel}</span>
              <span className="hidden sm:inline">{cat.label}</span>
            </>
          ) : (
            cat.label
          );
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] sm:text-xs font-medium transition-all touch-manipulation active:scale-[0.98] min-h-[3.25rem] ${
                active
                  ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <CategoryIcon
                id={cat.id}
                className={`w-[18px] h-[18px] sm:w-5 sm:h-5 ${active ? "text-white" : "text-gray-500"}`}
              />
              <span className="leading-tight text-center">{displayLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 overflow-hidden">
        {activeCategory === "all" && grouped ? (
          <div className="divide-y divide-gray-200">
            {grouped.map(({ category, items }) =>
              items.length === 0 ? null : (
                <div key={category.id} className="p-3 sm:p-4">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                    <CategoryIcon id={category.id} className="w-3.5 h-3.5 text-gray-400" />
                    {category.label}
                  </p>
                  <div className="space-y-2">
                    {items.map((entry) => (
                      <CatalogRow
                        key={entry.id}
                        entry={entry}
                        selected={selectedEntryId === entry.id}
                        onSelectAction={onSelectAction}
                        onOpenPwaTab={onOpenPwaTab}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        ) : entries.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">В этой категории пока нет конвертаций.</p>
        ) : (
          <div className="p-3 sm:p-4 space-y-2">
            {entries.map((entry) => (
              <CatalogRow
                key={entry.id}
                entry={entry}
                selected={selectedEntryId === entry.id}
                onSelectAction={onSelectAction}
                onOpenPwaTab={onOpenPwaTab}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed px-1">
        <span className="text-gray-600 font-medium">Аудио:</span> при конвертации в MP3 и «Исправить
        имя MP3» битые названия (CP1251/UTF-8) восстанавливаются автоматически; если есть ID3-теги —
        имя берётся из них.
      </p>
    </section>
  );
}

function CatalogRow({
  entry,
  selected,
  onSelectAction,
  onOpenPwaTab,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelectAction: (actionId: ActionId, entry: CatalogEntry) => void;
  onOpenPwaTab?: () => void;
}) {
  const isPwa = entry.id === "pwa-icons";
  const disabled = entry.comingSoon || (!entry.actionId && !isPwa);

  const handleClick = () => {
    if (entry.comingSoon) return;
    if (entry.id === "pwa-icons") {
      onOpenPwaTab?.();
      return;
    }
    if (entry.actionId) onSelectAction(entry.actionId, entry);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`w-full text-left rounded-xl border px-3 py-3 transition-all touch-manipulation active:scale-[0.99] ${
        entry.comingSoon
          ? "border-gray-100 bg-white/60 opacity-60 cursor-not-allowed"
          : selected
            ? "border-gray-900 bg-white ring-1 ring-gray-900/15 shadow-sm"
            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <CategoryIcon id={entry.category} className="w-4 h-4 text-gray-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{entry.label}</span>
            {entry.featured && !entry.comingSoon && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                популярное
              </span>
            )}
            {entry.comingSoon && (
              <span className="text-[10px] font-mono uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                скоро
              </span>
            )}
            {entry.id === "fix-mp3-name" && (
              <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                авто-имя
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{entry.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 border border-gray-200 px-2 py-0.5 text-gray-600">
              <span className="text-gray-400">Загрузите</span>
              {entry.inputFormats}
            </span>
            <span className="text-gray-300" aria-hidden>
              →
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-900 text-white px-2 py-0.5">
              {entry.outputFormats}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
