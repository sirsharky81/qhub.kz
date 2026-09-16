"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChess } from "@/lib/games/chess/rules";
import type { ChessColor, ChessLastMove, ChessPieceType } from "@/lib/games/chess/types";
import { ChessPiece } from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const LIGHT = "linear-gradient(165deg, #f7f0e4 0%, #efe4d0 48%, #e7d8c0 100%)";
const DARK = "linear-gradient(165deg, #8a7663 0%, #6e5b4a 52%, #5f4e3f 100%)";

type BoardPiece = {
  id: string;
  square: string;
  type: ChessPieceType;
  color: ChessColor;
};

function squareToXY(square: string, orientation: ChessColor): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  if (orientation === "w") return { x: file, y: 7 - rank };
  return { x: 7 - file, y: rank };
}

function xyToSquare(x: number, y: number, orientation: ChessColor): string {
  const file = orientation === "w" ? x : 7 - x;
  const rank = orientation === "w" ? 7 - y : y;
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function parsePieces(fen: string): Omit<BoardPiece, "id">[] {
  const chess = createChess(fen);
  const out: Omit<BoardPiece, "id">[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      out.push({ square: cell.square, type: cell.type, color: cell.color });
    }
  }
  return out;
}

function fileOf(square: string): number {
  return square.charCodeAt(0) - 97;
}
function rankOf(square: string): number {
  return Number(square[1]) - 1;
}
function dist(a: string, b: string): number {
  return Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));
}

function matchPieces(prev: BoardPiece[], next: Omit<BoardPiece, "id">[]): BoardPiece[] {
  const unused = [...prev];
  let serial = prev.reduce((max, piece) => Math.max(max, Number(piece.id.split("-").at(-1) || 0)), 0);
  return next.map((piece) => {
    let bestIndex = -1;
    let bestDist = 99;
    unused.forEach((candidate, index) => {
      if (candidate.type !== piece.type || candidate.color !== piece.color) return;
      const d = dist(candidate.square, piece.square);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      const matched = unused.splice(bestIndex, 1)[0]!;
      return { ...piece, id: matched.id };
    }
    serial += 1;
    return { ...piece, id: `${piece.color}-${piece.type}-${serial}` };
  });
}

function kingSquare(fen: string, color: ChessColor): string | null {
  return parsePieces(fen).find((piece) => piece.type === "k" && piece.color === color)?.square ?? null;
}

export function ChessBoard({
  fen,
  orientation,
  lastMove,
  inCheck,
  currentTurn,
  interactable,
  legalTargets,
  onMove,
  onSelectChange,
}: {
  fen: string;
  orientation: ChessColor;
  lastMove: ChessLastMove | null;
  inCheck: boolean;
  currentTurn: ChessColor;
  interactable: boolean;
  legalTargets: (from: string) => string[];
  onMove: (from: string, to: string) => void;
  onSelectChange?: (square: string | null) => void;
}) {
  const selectedRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const piecesRef = useRef<BoardPiece[]>([]);
  const pieces = useMemo(() => {
    const next = matchPieces(piecesRef.current, parsePieces(fen));
    piecesRef.current = next;
    return next;
  }, [fen]);

  useEffect(() => {
    selectedRef.current = null;
    draggingRef.current = false;
    setSelected(null);
  }, [fen]);

  const targets = selected ? legalTargets(selected) : [];
  const checkSq = inCheck ? kingSquare(fen, currentTurn) : null;
  const occupiedByMe = new Map(pieces.filter((piece) => piece.color === orientation).map((piece) => [piece.square, true]));

  const select = (square: string | null) => {
    selectedRef.current = square;
    setSelected(square);
    onSelectChange?.(square);
  };

  const tryMove = (from: string, to: string) => {
    if (from === to) return false;
    onMove(from, to);
    select(null);
    draggingRef.current = false;
    return true;
  };

  const handleSquarePointerDown = (square: string) => {
    if (!interactable) return;
    if (selectedRef.current && legalTargets(selectedRef.current).includes(square)) {
      tryMove(selectedRef.current, square);
      return;
    }
    if (occupiedByMe.get(square)) {
      select(square);
      draggingRef.current = true;
    } else {
      select(null);
    }
  };

  const handleSquarePointerUp = (square: string) => {
    if (!interactable || !draggingRef.current || !selectedRef.current) {
      draggingRef.current = false;
      return;
    }
    if (legalTargets(selectedRef.current).includes(square)) {
      tryMove(selectedRef.current, square);
      return;
    }
    draggingRef.current = false;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-stone-100 via-amber-50 to-stone-200 p-[7px] shadow-md dark:border-slate-700 dark:from-stone-900 dark:via-stone-900 dark:to-stone-800">
      <div className="relative aspect-square w-full select-none overflow-hidden rounded-xl shadow-[inset_0_1px_2px_rgba(15,23,42,0.18)]">
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }, (_, index) => {
            const x = index % 8;
            const y = Math.floor(index / 8);
            const square = xyToSquare(x, y, orientation);
            const dark = (x + y) % 2 === 1;
            const isLastFrom = lastMove?.from === square;
            const isLastTo = lastMove?.to === square;
            const isSelected = selected === square;
            const isTarget = targets.includes(square);
            const isCheck = checkSq === square;
            const fileLabel = y === 7 ? (orientation === "w" ? FILES[x] : FILES[7 - x]) : null;
            const rankLabel = x === 0 ? (orientation === "w" ? String(8 - y) : String(y + 1)) : null;
            return (
              <button
                key={square}
                type="button"
                onPointerDown={() => handleSquarePointerDown(square)}
                onPointerUp={() => handleSquarePointerUp(square)}
                className="relative overflow-hidden touch-manipulation"
                style={{ backgroundImage: dark ? DARK : LIGHT }}
                aria-label={square}
              >
                {isLastFrom ? <span className="absolute inset-0 bg-amber-300/35 mix-blend-multiply" /> : null}
                {isLastTo ? <span className="absolute inset-0 bg-amber-400/50 mix-blend-multiply" /> : null}
                {isSelected ? <span className="absolute inset-0 bg-sky-400/28 shadow-[inset_0_0_0_2px_rgba(15,23,42,0.45)]" /> : null}
                {isCheck ? <span className="absolute inset-0 bg-rose-500/42" /> : null}
                {rankLabel ? (
                  <span
                    className={`absolute left-0.5 top-0 z-[1] text-[10px] font-semibold ${
                      dark ? "text-amber-50/90" : "text-stone-600"
                    }`}
                  >
                    {rankLabel}
                  </span>
                ) : null}
                {fileLabel ? (
                  <span
                    className={`absolute bottom-0 right-0.5 z-[1] text-[10px] font-semibold ${
                      dark ? "text-amber-50/90" : "text-stone-600"
                    }`}
                  >
                    {fileLabel}
                  </span>
                ) : null}
                {isTarget ? (
                  <span
                    className={`absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full ${
                      occupiedByMe.get(square) || pieces.some((piece) => piece.square === square)
                        ? "h-[82%] w-[82%] border-[3px] border-slate-900/30"
                        : "h-2.5 w-2.5 bg-slate-900/30 sm:h-3 sm:w-3"
                    }`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          {pieces.map((piece) => {
            const { x, y } = squareToXY(piece.square, orientation);
            return (
              <div
                key={piece.id}
                className="absolute flex h-[12.5%] w-[12.5%] items-center justify-center overflow-visible transition-[left,top] duration-200 ease-out"
                style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%` }}
              >
                <ChessPiece type={piece.type} color={piece.color} onBoard />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
