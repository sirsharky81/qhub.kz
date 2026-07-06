import { describe, expect, it } from "vitest";
import { GameEngine } from "@/lib/games/core/engine";
import { cardId, type PlayingCard } from "@/lib/games/cards/types";
import { createSpiderDeck, dealSpider, spiderCardId } from "./deck";
import { createInitialSpiderState, createSpiderDefinition, autoRemoveCompleteRuns } from "./rules";
import type { SpiderColumnCard, SpiderState } from "./types";
import {
  canDealStock,
  canPlaceStack,
  findCompleteRunStart,
  getLegalMoveTargets,
  isSameSuitDescending,
  spiderRankValue,
} from "./validators";

function col(...entries: Array<{ card: PlayingCard; faceUp?: boolean }>): SpiderColumnCard[] {
  return entries.map((entry) => ({ card: entry.card, faceUp: entry.faceUp ?? true }));
}

function card(suit: PlayingCard["suit"], rank: PlayingCard["rank"], copy = 0): PlayingCard {
  return { id: spiderCardId(suit, rank, copy), suit, rank };
}

describe("spider deck", () => {
  it("creates 104 cards for each suit mode", () => {
    expect(createSpiderDeck(1)).toHaveLength(104);
    expect(createSpiderDeck(2)).toHaveLength(104);
    expect(createSpiderDeck(4)).toHaveLength(104);
  });

  it("deals 54 cards to tableau and 50 to stock", () => {
    const deck = createSpiderDeck(4);
    const { columns, stock } = dealSpider(deck);
    expect(columns).toHaveLength(10);
    expect(stock).toHaveLength(50);
    const onTableau = columns.reduce((sum, column) => sum + column.length, 0);
    expect(onTableau).toBe(54);
    expect(columns[0]).toHaveLength(6);
    expect(columns[4]).toHaveLength(5);
  });
});

describe("spider validators", () => {
  it("treats ace as low rank", () => {
    expect(spiderRankValue(14)).toBe(1);
    expect(spiderRankValue(13)).toBe(13);
  });

  it("allows placing jack on queen regardless of suit", () => {
    const jack = card("hearts", 11);
    const queen = card("spades", 12);
    expect(canPlaceStack([jack], queen)).toBe(true);
  });

  it("requires same-suit descending stack for empty column", () => {
    const queen = card("spades", 12);
    const jack = card("hearts", 11);
    expect(canPlaceStack([queen], null)).toBe(true);
    expect(canPlaceStack([queen, jack], null)).toBe(false);
    expect(canPlaceStack([queen, card("spades", 11)], null)).toBe(true);
  });

  it("detects king-to-ace run", () => {
    const run = col(
      { card: card("spades", 13) },
      { card: card("spades", 12) },
      { card: card("spades", 11) },
      { card: card("spades", 10) },
      { card: card("spades", 9) },
      { card: card("spades", 8) },
      { card: card("spades", 7) },
      { card: card("spades", 6) },
      { card: card("spades", 5) },
      { card: card("spades", 4) },
      { card: card("spades", 3) },
      { card: card("spades", 2) },
      { card: card("spades", 14) },
    );
    expect(findCompleteRunStart(run)).toBe(0);
    expect(isSameSuitDescending(run.map((entry) => entry.card))).toBe(true);
  });
});

describe("spider rules", () => {
  it("blocks stock deal when empty column exists", () => {
    const state: SpiderState = {
      ...createInitialSpiderState(1),
      columns: Array.from({ length: 10 }, (_, index) =>
        index === 0 ? [] : col({ card: card("spades", 6) }),
      ),
      stock: createSpiderDeck(1).slice(0, 50),
      phase: "playing",
    };
    expect(canDealStock(state)).toBe(false);
    const engine = new GameEngine(createSpiderDefinition({ suitMode: 1 }));
    engine.replaceState(state);
    const result = engine.dispatch({ type: "deal_stock" }, { actorId: "player", at: Date.now() });
    expect(result.valid).toBe(false);
  });

  it("moves stack and flips face-down card", () => {
    const state: SpiderState = {
      gameId: "test",
      phase: "playing",
      suitMode: 1,
      completedRuns: 0,
      moves: 0,
      startedAt: Date.now(),
      stock: [],
      columns: [
        col({ card: card("spades", 5), faceUp: false }, { card: card("spades", 6) }),
        col({ card: card("spades", 7) }),
        ...Array.from({ length: 8 }, () => col({ card: card("spades", 4) })),
      ],
    };
    const engine = new GameEngine(createSpiderDefinition({ suitMode: 1 }));
    engine.replaceState(state);
    const result = engine.dispatch(
      { type: "move_stack", fromColumn: 0, fromIndex: 1, toColumn: 1 },
      { actorId: "player", at: Date.now() },
    );
    expect(result.valid).toBe(true);
    const next = engine.getState();
    expect(next.columns[1]!.map((entry) => entry.card.rank)).toEqual([7, 6]);
    expect(next.columns[0]![0]!.faceUp).toBe(true);
  });

  it("removes complete run automatically", () => {
    const runCards = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 14] as const;
    const run = col(...runCards.map((rank) => ({ card: card("spades", rank) })));
    const state: SpiderState = {
      gameId: "test",
      phase: "playing",
      suitMode: 1,
      completedRuns: 0,
      moves: 0,
      startedAt: Date.now(),
      stock: [],
      columns: [run, ...Array.from({ length: 9 }, () => col({ card: card("spades", 6) }))],
    };
    const next = autoRemoveCompleteRuns(state);
    expect(next.completedRuns).toBe(1);
    expect(next.columns[0]).toHaveLength(0);
  });

  it("lists legal targets for movable stack", () => {
    const state: SpiderState = {
      gameId: "test",
      phase: "playing",
      suitMode: 1,
      completedRuns: 0,
      moves: 0,
      startedAt: Date.now(),
      stock: [],
      columns: [
        col({ card: card("spades", 6) }),
        col({ card: card("spades", 7) }),
        ...Array.from({ length: 8 }, () => []),
      ],
    };
    expect(getLegalMoveTargets(state, 0, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
