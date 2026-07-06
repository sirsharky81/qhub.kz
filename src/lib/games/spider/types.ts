import type { PlayingCard } from "@/lib/games/cards/types";

export type SpiderSuitMode = 1 | 2 | 4;
export type SpiderPhase = "playing" | "won" | "stuck";

export interface SpiderColumnCard {
  card: PlayingCard;
  faceUp: boolean;
}

export interface SpiderState {
  gameId: string;
  phase: SpiderPhase;
  suitMode: SpiderSuitMode;
  columns: SpiderColumnCard[][];
  stock: PlayingCard[];
  completedRuns: number;
  moves: number;
  startedAt: number;
}

export type SpiderAction =
  | {
      type: "move_stack";
      fromColumn: number;
      fromIndex: number;
      toColumn: number;
    }
  | { type: "deal_stock" }
  | { type: "new_game"; suitMode: SpiderSuitMode };
