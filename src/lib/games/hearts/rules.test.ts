import { describe, expect, it } from "vitest";
import { GameEngine } from "@/lib/games/core/engine";
import { heartsAiService } from "./ai/service";
import { getPassDirection } from "./passing";
import { createHeartsDefinition } from "./rules";
import { scoreHeartsRound } from "./scoring";
import type { HeartsState } from "./types";
import { legalCardsForPlayer } from "./validators";

function createTestDefinition() {
  return createHeartsDefinition({
    players: [
      { id: "p1", name: "P1", isBot: false, aiLevel: "medium" },
      { id: "p2", name: "P2", isBot: false, aiLevel: "medium" },
      { id: "p3", name: "P3", isBot: false, aiLevel: "medium" },
      { id: "p4", name: "P4", isBot: false, aiLevel: "medium" },
    ],
  });
}

describe("hearts rules", () => {
  it("uses proper pass direction cycle", () => {
    expect(getPassDirection(0)).toBe("left");
    expect(getPassDirection(1)).toBe("right");
    expect(getPassDirection(2)).toBe("across");
    expect(getPassDirection(3)).toBe("none");
    expect(getPassDirection(4)).toBe("left");
  });

  it("forces first trick leader to play 2♣", () => {
    const definition = createTestDefinition();
    const base = definition.initialState();
    const state: HeartsState = { ...base, phase: "playing" };
    const legal = legalCardsForPlayer(state, state.currentTurnId);
    expect(legal).toHaveLength(1);
    expect(legal[0]!.id).toBe("2C");
  });

  it("scores shoot the moon correctly", () => {
    const moonCards = [
      ...new Array(13).fill(0).map((_, i) => ({
        id: `${i + 2}H`,
        rank: (i + 2) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14,
        suit: "hearts" as const,
      })),
      { id: "QS", rank: 12 as const, suit: "spades" as const },
    ];
    const { players } = scoreHeartsRound(
      [
        {
          id: "p1",
          name: "P1",
          isBot: false,
          aiLevel: "easy",
          hand: [],
          takenCards: moonCards,
          totalPenalty: 0,
        },
        {
          id: "p2",
          name: "P2",
          isBot: false,
          aiLevel: "easy",
          hand: [],
          takenCards: [],
          totalPenalty: 0,
        },
        {
          id: "p3",
          name: "P3",
          isBot: false,
          aiLevel: "easy",
          hand: [],
          takenCards: [],
          totalPenalty: 0,
        },
        {
          id: "p4",
          name: "P4",
          isBot: false,
          aiLevel: "easy",
          hand: [],
          takenCards: [],
          totalPenalty: 0,
        },
      ],
      0,
    );

    // p1 has all 26 penalties => 0, others get 26
    expect(players.find((p) => p.id === "p1")!.totalPenalty).toBe(0);
    expect(players.find((p) => p.id === "p2")!.totalPenalty).toBe(26);
    expect(players.find((p) => p.id === "p3")!.totalPenalty).toBe(26);
    expect(players.find((p) => p.id === "p4")!.totalPenalty).toBe(26);
  });

  it("keeps game alive on tie at minimum score after reaching target", () => {
    const definition = createTestDefinition();
    const base = definition.initialState();
    const tieState: HeartsState = {
      ...base,
      phase: "playing",
      trick: { leaderId: base.currentTurnId, leadSuit: null, cards: [] },
      players: base.players.map((p, idx) => ({
        ...p,
        hand: [],
        takenCards: [],
        totalPenalty: [100, 100, 120, 140][idx]!,
      })),
    };
    const next = definition.scoreRound(tieState);
    expect(next.phase).not.toBe("game_end");
    expect(next.winnerId).toBeNull();
  });

  it("rejects illegal play in server-authoritative engine dispatch", () => {
    const definition = createTestDefinition();
    const engine = new GameEngine(definition);
    const state = engine.getState();
    const wrongPlayer = state.players.find((p) => p.id !== state.currentTurnId)!;
    const result = engine.dispatch(
      { type: "play_card", playerId: wrongPlayer.id, cardId: wrongPlayer.hand[0]!.id },
      { actorId: wrongPlayer.id, at: Date.now() },
    );
    expect(result.valid).toBe(false);
  });

  it("returns fallback action for AI level", () => {
    const legal = [{ type: "play_card", playerId: "p1", cardId: "2C" }] as const;
    const choice = heartsAiService.choose("easy", {
      state: createTestDefinition().initialState(),
      playerId: "p1",
      legalActions: [...legal],
    });
    expect(choice).not.toBeNull();
  });
});
