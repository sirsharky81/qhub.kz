"use client";

import type { ChessColor, ChessPieceType } from "@/lib/games/chess/types";

/** CBurnett SVG chess pieces from Wikimedia Commons (GPL / CC BY-SA). */
const FILE: Record<ChessPieceType, string> = {
  k: "K",
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
  p: "P",
};

/** Artwork sits in a padded 45×45 viewBox; keep a margin inside each square. */
const BOARD_SCALE = 1.08;

export function ChessPiece({
  type,
  color,
  className = "",
  onBoard = false,
}: {
  type: ChessPieceType;
  color: ChessColor;
  className?: string;
  onBoard?: boolean;
}) {
  const src = `/tools/games/chess/pieces/${color === "w" ? "w" : "b"}${FILE[type]}.svg?v=3`;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`pointer-events-none block select-none object-contain ${
        onBoard ? "max-h-none max-w-none" : "h-full w-full"
      } ${className}`}
      style={
        onBoard
          ? {
              width: `${BOARD_SCALE * 100}%`,
              height: `${BOARD_SCALE * 100}%`,
              filter: "drop-shadow(0 0 0.55px #fff) drop-shadow(0 1px 1px rgba(15,23,42,.28))",
            }
          : undefined
      }
    />
  );
}
