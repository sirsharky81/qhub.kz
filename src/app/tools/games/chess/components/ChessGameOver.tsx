"use client";

import type { ChessEndReason } from "@/lib/games/chess/types";

const REASON_TEXT: Record<ChessEndReason, string> = {
  checkmate: "Мат",
  stalemate: "Пат — ничья",
  timeout: "Время истекло",
  resign: "Игрок сдался",
  draw_agreement: "Ничья по соглашению",
  threefold: "Ничья: троекратное повторение",
  fifty_moves: "Ничья: правило 50 ходов",
  insufficient: "Ничья: недостаточно материала",
  disconnect: "Соперник отключился",
};

export function ChessGameOver({
  reason,
  winnerName,
  onRematch,
  onMenu,
}: {
  reason: ChessEndReason;
  winnerName: string | null;
  onRematch?: () => void;
  onMenu: () => void;
}) {
  const title = winnerName ? `${winnerName} побеждает` : "Ничья";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-center shadow-2xl dark:bg-zinc-900">
        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{REASON_TEXT[reason]}</p>
        <div className="mt-4 grid gap-2">
          {onRematch ? (
            <button
              type="button"
              onClick={onRematch}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Новая партия
            </button>
          ) : null}
          <button
            type="button"
            onClick={onMenu}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            В меню
          </button>
        </div>
      </div>
    </div>
  );
}
