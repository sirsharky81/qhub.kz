"use client";

import type { ChessPieceType } from "@/lib/games/chess/types";
import { ChessPiece } from "./ChessPiece";

const OPTIONS: ChessPieceType[] = ["q", "r", "b", "n"];
const LABELS: Record<ChessPieceType, string> = { q: "Ферзь", r: "Ладья", b: "Слон", n: "Конь", k: "Король", p: "Пешка" };

export function ChessPromotion({
  color,
  onChoose,
  onCancel,
}: {
  color: "w" | "b";
  onChoose: (piece: ChessPieceType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 rounded-b-md bg-zinc-900/95 p-3 shadow-xl">
      <p className="mb-2 text-center text-xs font-medium text-white">Превращение пешки</p>
      <div className="grid grid-cols-4 gap-2">
        {OPTIONS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChoose(type)}
            className="flex flex-col items-center rounded-lg bg-white/10 px-2 py-2 text-white hover:bg-white/20"
          >
            <span className="h-12 w-12">
              <ChessPiece type={type} color={color} />
            </span>
            <span className="mt-1 text-[11px]">{LABELS[type]}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="mt-2 w-full text-xs text-zinc-300 hover:text-white">
        Отмена
      </button>
    </div>
  );
}
