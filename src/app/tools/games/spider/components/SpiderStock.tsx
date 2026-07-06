"use client";

import { canDealStock, hasEmptyColumn } from "@/lib/games/spider/validators";
import type { SpiderState } from "@/lib/games/spider/types";
import { SpiderCard } from "./SpiderCard";

const STOCK_CARD = { id: "2S~0", suit: "spades" as const, rank: 2 as const };

export function SpiderStock({
  state,
  onDeal,
  dealing,
}: {
  state: SpiderState;
  onDeal: () => void;
  dealing?: boolean;
}) {
  const dealAllowed = canDealStock(state) && !dealing;
  const emptyColumns = hasEmptyColumn(state);
  const dealsLeft = Math.floor(state.stock.length / 10);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        data-spider-stock
        onClick={onDeal}
        disabled={!dealAllowed}
        aria-label={
          emptyColumns
            ? "Перед добором заполните все пустые столбцы"
            : dealsLeft === 0
              ? "Резерв пуст"
              : "Раздать по карте в каждый столбец"
        }
        title={
          emptyColumns
            ? "Перед добором заполните все пустые столбцы"
            : dealsLeft === 0
              ? "Резерв пуст"
              : "Раздать по карте в каждый столбец"
        }
        className={`relative min-w-[56px] min-h-[56px] p-1 -m-1 rounded-xl transition-transform duration-200 touch-manipulation ${
          dealAllowed ? "hover:-translate-y-0.5 active:scale-[0.96]" : "opacity-45 cursor-not-allowed"
        } ${dealing ? "animate-pulse" : ""}`}
      >
        {state.stock.length > 0 ? (
          <div className="relative w-[clamp(56px,7.5vw,76px)]">
            <SpiderCard
              card={STOCK_CARD}
              hidden
              interactive={dealAllowed}
              className="relative z-[3] w-full"
            />
            <SpiderCard
              card={STOCK_CARD}
              hidden
              className="absolute left-0 top-0 z-[2] w-full translate-x-[2px] -translate-y-[2px]"
            />
            <SpiderCard
              card={STOCK_CARD}
              hidden
              className="absolute left-0 top-0 z-[1] w-full translate-x-[4px] -translate-y-[4px]"
            />
          </div>
        ) : (
          <SpiderCard placeholder className="w-[clamp(56px,7.5vw,76px)]" />
        )}
      </button>

      {state.stock.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2.5 shadow-sm">
          <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50 leading-none">
            ×{dealsLeft}
          </span>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300 leading-snug whitespace-nowrap">
            {dealsLeft === 1 ? "раздача" : dealsLeft < 5 ? "раздачи" : "раздач"}
          </span>
        </div>
      )}
    </div>
  );
}
