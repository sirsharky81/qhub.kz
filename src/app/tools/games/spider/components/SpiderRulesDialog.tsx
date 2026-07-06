"use client";

import { useEffect } from "react";
import { SPIDER_TOTAL_RUNS } from "@/lib/games/spider/validators";

export function SpiderRulesDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        role="dialog"
        aria-labelledby="spider-rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-3 backdrop-blur-sm">
          <h2 id="spider-rules-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Правила «Паука»
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 min-h-[44px] text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 touch-manipulation"
          >
            Закрыть
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Цель</h3>
            <p className="mt-1">
              Собрать {SPIDER_TOTAL_RUNS} полных последовательностей от Короля до Туза одной масти
              (K→Q→…→2→A) и очистить поле. Используются две колоды — 104 карты.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Расклад</h3>
            <ul className="mt-1 list-disc pl-4 space-y-1">
              <li>10 столбцов: в первых четырёх по 6 карт, в остальных шести — по 5.</li>
              <li>Верхняя карта в каждом столбце открыта, остальные закрыты.</li>
              <li>50 карт остаются в резерве для добора.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Сложность</h3>
            <ul className="mt-1 list-disc pl-4 space-y-1">
              <li><strong>1 масть</strong> — лёгкий режим, все карты одной масти.</li>
              <li><strong>2 масти</strong> — средний, пики и черви.</li>
              <li><strong>4 масти</strong> — сложный, все четыре масти.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ходы</h3>
            <ul className="mt-1 list-disc pl-4 space-y-1">
              <li>Карту можно класть на карту на один ранг выше — масть не важна.</li>
              <li>Стопку переносят только если она одной масти и по убыванию.</li>
              <li>В пустой столбец — любая карта или правильная одномастная стопка.</li>
              <li>Открытая последовательность K→A одной масти уходит в дом автоматически.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Резерв</h3>
            <p className="mt-1">
              Нажмите на колоду — по одной открытой карте ляжет в каждый столбец. Добор запрещён,
              пока есть хотя бы один пустой столбец — сначала заполните все пустые места.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Управление</h3>
            <ul className="mt-1 list-disc pl-4 space-y-1">
              <li className="sm:hidden">Нажмите карту или столбец, затем столбец назначения. Резерв — нажатие на колоду.</li>
              <li className="hidden sm:list-item">Перетаскивайте стопку мышью или выберите карту и столбец кликом.</li>
            </ul>
            <ul className="mt-2 list-disc pl-4 space-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              <li className="hidden sm:list-item"><kbd className="px-1 rounded bg-gray-100 dark:bg-gray-800">Ctrl+Z</kbd> — отменить ход</li>
              <li className="hidden sm:list-item"><kbd className="px-1 rounded bg-gray-100 dark:bg-gray-800">H</kbd> — подсказка</li>
              <li className="hidden sm:list-item"><kbd className="px-1 rounded bg-gray-100 dark:bg-gray-800">N</kbd> — новая игра</li>
              <li className="sm:hidden">Кнопки «Отменить», «Подсказка» и «Новая» — в панели над полем.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
