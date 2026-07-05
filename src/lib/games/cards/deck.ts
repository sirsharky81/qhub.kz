import { fisherYatesShuffle } from "@/lib/games/shared/random";
import { CARD_RANKS, CARD_SUITS, cardId, type PlayingCard } from "./types";

export function createStandardDeck52(): PlayingCard[] {
  const cards: PlayingCard[] = [];
  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      cards.push({
        id: cardId(suit, rank),
        suit,
        rank,
      });
    }
  }
  return cards;
}

export function shuffleDeck(deck: readonly PlayingCard[]): PlayingCard[] {
  return fisherYatesShuffle(deck);
}

export function dealEvenly(deck: readonly PlayingCard[], playerCount: number): PlayingCard[][] {
  if (playerCount < 2) {
    throw new Error("Player count must be at least 2");
  }
  if (deck.length % playerCount !== 0) {
    throw new Error("Deck cannot be dealt evenly");
  }
  const handSize = deck.length / playerCount;
  const hands = Array.from({ length: playerCount }, () => [] as PlayingCard[]);
  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < playerCount; p++) {
      hands[p]!.push(deck[i * playerCount + p]!);
    }
  }
  return hands;
}
