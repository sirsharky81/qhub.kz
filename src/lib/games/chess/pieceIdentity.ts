import type { ChessColor, ChessLastMove, ChessPieceType } from "./types";

export type IdentifiedPiece = {
  id: string;
  square: string;
  type: ChessPieceType;
  color: ChessColor;
};

function fileOf(square: string): number {
  return square.charCodeAt(0) - 97;
}

function rankOf(square: string): number {
  return Number(square[1]) - 1;
}

function dist(a: string, b: string): number {
  return Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));
}

/**
 * Keep React keys stable across FEN updates so only the piece that moved
 * animates. Matching by nearest neighbour swaps identical pieces (two knights)
 * when a jump lands closer to the idle one.
 */
export function matchPieces(
  prev: IdentifiedPiece[],
  next: Omit<IdentifiedPiece, "id">[],
  lastMove?: ChessLastMove | null,
): IdentifiedPiece[] {
  const unused = [...prev];
  let serial = prev.reduce((max, piece) => Math.max(max, Number(piece.id.split("-").at(-1) || 0)), 0);

  const take = (predicate: (piece: IdentifiedPiece) => boolean): IdentifiedPiece | undefined => {
    const index = unused.findIndex(predicate);
    if (index < 0) return undefined;
    return unused.splice(index, 1)[0];
  };

  const assigned: Array<IdentifiedPiece | null> = next.map(() => null);

  next.forEach((piece, index) => {
    const stayed = take(
      (candidate) => candidate.square === piece.square && candidate.type === piece.type && candidate.color === piece.color,
    );
    if (stayed) assigned[index] = { ...piece, id: stayed.id };
  });

  if (lastMove) {
    next.forEach((piece, index) => {
      if (assigned[index] || piece.square !== lastMove.to) return;
      const mover = take(
        (candidate) =>
          candidate.square === lastMove.from &&
          candidate.color === piece.color &&
          (candidate.type === piece.type || candidate.type === "p"),
      );
      if (mover) assigned[index] = { ...piece, id: mover.id };
    });
  }

  next.forEach((piece, index) => {
    if (assigned[index]) return;
    let bestIndex = -1;
    let bestDist = 99;
    unused.forEach((candidate, candidateIndex) => {
      if (candidate.type !== piece.type || candidate.color !== piece.color) return;
      const d = dist(candidate.square, piece.square);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = candidateIndex;
      }
    });
    if (bestIndex >= 0) {
      const matched = unused.splice(bestIndex, 1)[0]!;
      assigned[index] = { ...piece, id: matched.id };
      return;
    }
    serial += 1;
    assigned[index] = { ...piece, id: `${piece.color}-${piece.type}-${serial}` };
  });

  return assigned as IdentifiedPiece[];
}
