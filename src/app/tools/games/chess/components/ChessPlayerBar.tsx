"use client";

import type { ChessColor, ChessPieceType } from "@/lib/games/chess/types";
import { ChessClock } from "./ChessClock";
import { ChessPiece } from "./ChessPiece";

export function ChessPlayerBar({
  name,
  color,
  captured,
  remainingMs,
  active,
  flag,
}: {
  name: string;
  color: ChessColor;
  captured: ChessPieceType[];
  remainingMs: number;
  active: boolean;
  flag?: string | null;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
        active
          ? "border-slate-800 bg-slate-900 text-white dark:border-slate-600"
          : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${color === "w" ? "bg-white" : "bg-zinc-950 ring-1 ring-white/50"}`}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {flag ? `${flag} ${name}` : name}
          </p>
          <div className="mt-0.5 flex min-h-[14px] flex-wrap items-center gap-x-0.5">
            {captured.map((type, index) => (
              <span key={`${type}-${index}`} className="inline-flex h-3.5 w-3.5">
                <ChessPiece type={type} color={color === "w" ? "b" : "w"} />
              </span>
            ))}
          </div>
        </div>
      </div>
      <ChessClock remainingMs={remainingMs} active={active} />
    </div>
  );
}
