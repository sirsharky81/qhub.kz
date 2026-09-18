import { describe, expect, it } from "vitest";
import { matchPieces, type IdentifiedPiece } from "./pieceIdentity";

function piece(id: string, square: string, type: IdentifiedPiece["type"], color: IdentifiedPiece["color"]): IdentifiedPiece {
  return { id, square, type, color };
}

describe("matchPieces", () => {
  it("does not swap knights when one jumps closer to the other", () => {
    const prev = [piece("n-b1", "b1", "n", "w"), piece("n-d2", "d2", "n", "w")];
    const next = [
      { square: "c3", type: "n" as const, color: "w" as const },
      { square: "d2", type: "n" as const, color: "w" as const },
    ];
    const matched = matchPieces(prev, next, { from: "b1", to: "c3" });
    expect(matched.find((item) => item.square === "c3")?.id).toBe("n-b1");
    expect(matched.find((item) => item.square === "d2")?.id).toBe("n-d2");
  });

  it("keeps an idle bishop in place without lastMove", () => {
    const prev = [piece("b-c1", "c1", "b", "w"), piece("b-f1", "f1", "b", "w")];
    const next = [
      { square: "e3", type: "b" as const, color: "w" as const },
      { square: "f1", type: "b" as const, color: "w" as const },
    ];
    const matched = matchPieces(prev, next);
    expect(matched.find((item) => item.square === "e3")?.id).toBe("b-c1");
    expect(matched.find((item) => item.square === "f1")?.id).toBe("b-f1");
  });

  it("maps castling rook after the king move", () => {
    const prev = [piece("k-e1", "e1", "k", "w"), piece("r-h1", "h1", "r", "w")];
    const next = [
      { square: "g1", type: "k" as const, color: "w" as const },
      { square: "f1", type: "r" as const, color: "w" as const },
    ];
    const matched = matchPieces(prev, next, { from: "e1", to: "g1" });
    expect(matched.find((item) => item.square === "g1")?.id).toBe("k-e1");
    expect(matched.find((item) => item.square === "f1")?.id).toBe("r-h1");
  });
});
