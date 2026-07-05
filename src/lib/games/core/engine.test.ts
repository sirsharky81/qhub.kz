import { describe, expect, it } from "vitest";
import { GameEngine } from "./engine";
import type { GameDefinition } from "./types";

interface CounterState {
  value: number;
}

type CounterAction = { type: "inc" } | { type: "set"; value: number };

const definition: GameDefinition<CounterState, CounterAction> = {
  gameId: "counter",
  initialState: () => ({ value: 0 }),
  validateAction: (_state, action) => {
    if (action.type === "set" && action.value < 0) {
      return { ok: false, reason: "negative value is forbidden" };
    }
    return { ok: true };
  },
  applyAction: (state, action) =>
    action.type === "inc" ? { value: state.value + 1 } : { value: action.value },
  getLegalActions: () => [{ type: "inc" }],
  isRoundFinished: () => false,
  scoreRound: (state) => state,
  isGameFinished: () => false,
};

describe("GameEngine", () => {
  it("applies validated actions", () => {
    const engine = new GameEngine(definition);
    const result = engine.dispatch({ type: "inc" }, { actorId: "test", at: Date.now() });
    expect(result.valid).toBe(true);
    expect(result.state.value).toBe(1);
  });

  it("rejects invalid actions and preserves state", () => {
    const engine = new GameEngine(definition);
    const result = engine.dispatch({ type: "set", value: -1 }, { actorId: "test", at: Date.now() });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("forbidden");
    expect(result.state.value).toBe(0);
  });
});
