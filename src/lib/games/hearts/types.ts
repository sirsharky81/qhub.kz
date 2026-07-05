import type { PlayingCard } from "@/lib/games/cards/types";

export type HeartsPhase = "passing" | "playing" | "round_end" | "game_end";
export type HeartsPassDirection = "left" | "right" | "across" | "none";
export type HeartsAiLevel = "easy" | "medium" | "hard";

export interface HeartsConfig {
  targetScore: number;
  turnTimeSec: number;
  passTimeSec: number;
}

export interface HeartsPlayerState {
  id: string;
  name: string;
  isBot: boolean;
  aiLevel: HeartsAiLevel;
  hand: PlayingCard[];
  takenCards: PlayingCard[];
  totalPenalty: number;
}

export interface HeartsPlayedCard {
  playerId: string;
  card: PlayingCard;
}

export interface HeartsTrick {
  leaderId: string;
  leadSuit: PlayingCard["suit"] | null;
  cards: HeartsPlayedCard[];
}

export interface HeartsRoundScore {
  roundIndex: number;
  penalties: Record<string, number>;
  shootMoonBy: string | null;
}

export interface HeartsState {
  gameId: string;
  phase: HeartsPhase;
  config: HeartsConfig;
  players: HeartsPlayerState[];
  roundIndex: number;
  passDirection: HeartsPassDirection;
  passSelections: Record<string, string[]>;
  currentTurnId: string;
  heartsBroken: boolean;
  trick: HeartsTrick;
  lastTrick: HeartsPlayedCard[];
  roundScores: HeartsRoundScore[];
  winnerId: string | null;
}

export type HeartsAction =
  | {
      type: "select_pass_cards";
      playerId: string;
      cardIds: string[];
    }
  | {
      type: "play_card";
      playerId: string;
      cardId: string;
    }
  | {
      type: "auto_fill_pass";
    };

export interface HeartsPlayerSeed {
  id: string;
  name: string;
  isBot?: boolean;
  aiLevel?: HeartsAiLevel;
}
