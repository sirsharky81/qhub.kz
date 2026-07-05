export type CardSuit = "clubs" | "diamonds" | "spades" | "hearts";

export type CardRank =
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14;

export interface PlayingCard {
  id: string;
  suit: CardSuit;
  rank: CardRank;
}

export const CARD_SUITS: readonly CardSuit[] = [
  "clubs",
  "diamonds",
  "spades",
  "hearts",
] as const;

export const CARD_RANKS: readonly CardRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;

export function cardId(suit: CardSuit, rank: CardRank): string {
  const suitCode = suit[0]!.toUpperCase();
  const rankCode =
    rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : rank === 14 ? "A" : String(rank);
  return `${rankCode}${suitCode}`;
}

export function isSameCard(a: PlayingCard, b: PlayingCard): boolean {
  return a.id === b.id;
}
