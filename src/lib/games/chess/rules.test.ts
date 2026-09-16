import { describe, expect, it } from "vitest";
import { GameEngine } from "@/lib/games/core/engine";
import { applyClockTimeout, remainingClockMs } from "./clock";
import { createChess, createChessDefinition, isPromotionMove } from "./rules";
import type { ChessState } from "./types";
import { TIME_CONTROLS } from "./types";

const RAPID = TIME_CONTROLS.find((item) => item.id === "10+0")!;

function createEngine(fen?: string) {
  const definition = createChessDefinition({
    gameId: "test",
    timeControl: RAPID,
    now: 1_000,
    players: [
      { id: "white", name: "White", color: "w" },
      { id: "black", name: "Black", color: "b" },
    ],
  });
  const engine = new GameEngine(definition);
  if (fen) {
    const state = engine.getState();
    const chess = createChess(fen);
    engine.replaceState({
      ...state,
      fen,
      currentTurn: chess.turn(),
      inCheck: chess.isCheck(),
      lastMoveAt: 1_000,
    });
  }
  return { definition, engine };
}

function play(engine: GameEngine<ChessState, import("./types").ChessAction>, actorId: string, from: string, to: string, at = 1_500, promotion?: "q" | "r" | "b" | "n") {
  return engine.dispatch(
    { type: "move", from, to, promotion },
    { actorId, at },
  );
}

describe("chess rules", () => {
  it("allows kingside castling", () => {
    const { engine } = createEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const result = play(engine, "white", "e1", "g1");
    expect(result.valid).toBe(true);
    expect(result.state.lastMove).toEqual({ from: "e1", to: "g1" });
    const chess = createChess(result.state.fen);
    expect(chess.get("g1")?.type).toBe("k");
    expect(chess.get("f1")?.type).toBe("r");
  });

  it("allows queenside castling", () => {
    const { engine } = createEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const result = play(engine, "white", "e1", "c1");
    expect(result.valid).toBe(true);
    const chess = createChess(result.state.fen);
    expect(chess.get("c1")?.type).toBe("k");
    expect(chess.get("d1")?.type).toBe("r");
  });

  it("rejects castling through check", () => {
    const { engine } = createEngine("4k3/8/8/8/5q2/8/8/R3K2R w KQ - 0 1");
    const result = play(engine, "white", "e1", "g1");
    expect(result.valid).toBe(false);
  });

  it("rejects castling while in check", () => {
    const { engine } = createEngine("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1");
    const result = play(engine, "white", "e1", "g1");
    expect(result.valid).toBe(false);
  });

  it("detects checkmate", () => {
    const { engine } = createEngine("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2");
    const result = play(engine, "black", "d8", "h4");
    expect(result.valid).toBe(true);
    expect(result.state.phase).toBe("finished");
    expect(result.state.endReason).toBe("checkmate");
    expect(result.state.winnerId).toBe("black");
  });

  it("detects stalemate", () => {
    const { engine } = createEngine("7k/8/6QK/8/8/8/8/8 w - - 0 1");
    const result = play(engine, "white", "g6", "f7");
    expect(result.valid).toBe(true);
    expect(result.state.phase).toBe("finished");
    expect(result.state.endReason).toBe("stalemate");
    expect(result.state.winnerId).toBeNull();
  });

  it("requires promotion choice and applies queen promotion", () => {
    const fen = "8/4P3/8/8/8/8/8/4K2k w - - 0 1";
    expect(isPromotionMove("e7", "e8", fen)).toBe(true);
    const { engine } = createEngine(fen);
    const missing = play(engine, "white", "e7", "e8");
    expect(missing.valid).toBe(false);
    const promoted = play(engine, "white", "e7", "e8", 1_500, "q");
    expect(promoted.valid).toBe(true);
    expect(createChess(promoted.state.fen).get("e8")?.type).toBe("q");
  });

  it("flags the player whose clock ran out", () => {
    const { engine } = createEngine();
    const flagged = applyClockTimeout(
      {
        ...engine.getState(),
        whiteMs: 200,
        lastMoveAt: 1_000,
        clocksRunning: true,
        currentTurn: "w",
      },
      1_400,
    );
    expect(flagged.phase).toBe("finished");
    expect(flagged.endReason).toBe("timeout");
    expect(flagged.winnerId).toBe("black");
    expect(flagged.whiteMs).toBe(0);
  });

  it("adds increment after a legal move", () => {
    const definition = createChessDefinition({
      gameId: "inc",
      timeControl: { id: "3+2", label: "Блиц 3+2", baseSec: 180, incrementSec: 2 },
      now: 1_000,
      players: [
        { id: "white", name: "White", color: "w" },
        { id: "black", name: "Black", color: "b" },
      ],
    });
    const engine = new GameEngine(definition);
    const result = play(engine, "white", "e2", "e4", 1_500);
    expect(result.valid).toBe(true);
    expect(result.state.whiteMs).toBe(180_000 - 500 + 2_000);
    expect(remainingClockMs(result.state, "b", 1_500)).toBe(180_000);
  });
});
