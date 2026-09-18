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
      className={`flex items-center gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-slate-900 ${
        active ? "border-slate-800 shadow-sm" : "border-slate-200"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            color === "w" ? "bg-white ring-1 ring-slate-400" : "bg-zinc-950"
          }`}
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
