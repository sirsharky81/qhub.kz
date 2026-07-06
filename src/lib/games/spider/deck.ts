import { shuffleDeck } from "@/lib/games/cards/deck";
import { CARD_RANKS, cardId, type CardSuit, type PlayingCard } from "@/lib/games/cards/types";
import type { SpiderColumnCard, SpiderSuitMode } from "./types";

const SPIDER_SUITS_BY_MODE: Record<SpiderSuitMode, readonly CardSuit[]> = {
  1: ["spades"],
  2: ["spades", "hearts"],
  4: ["clubs", "diamonds", "spades", "hearts"],
};

export function spiderCardId(suit: CardSuit, rank: PlayingCard["rank"], copy: number): string {
  return `${cardId(suit, rank)}~${copy}`;
}

export function createSpiderDeck(suitMode: SpiderSuitMode): PlayingCard[] {
  const suits = SPIDER_SUITS_BY_MODE[suitMode];
  const copiesPerRank = (104 / suits.length / CARD_RANKS.length) as number;
  const cards: PlayingCard[] = [];
  for (let copy = 0; copy < copiesPerRank; copy++) {
    for (const suit of suits) {
      for (const rank of CARD_RANKS) {
        cards.push({
          id: spiderCardId(suit, rank, copy),
          suit,
          rank,
        });
      }
    }
  }
  return cards;
}

export function dealSpider(shuffled: readonly PlayingCard[]): {
  columns: SpiderColumnCard[][];
  stock: PlayingCard[];
} {
  const columns = Array.from({ length: 10 }, () => [] as SpiderColumnCard[]);
  let index = 0;
  for (let col = 0; col < 10; col++) {
    const faceDownCount = col < 4 ? 5 : 4;
    for (let d = 0; d < faceDownCount; d++) {
      columns[col]!.push({ card: shuffled[index++]!, faceUp: false });
    }
    columns[col]!.push({ card: shuffled[index++]!, faceUp: true });
  }
  return { columns, stock: [...shuffled.slice(index)] };
}

export function createShuffledSpiderDeal(suitMode: SpiderSuitMode): {
  columns: SpiderColumnCard[][];
  stock: PlayingCard[];
} {
  return dealSpider(shuffleDeck(createSpiderDeck(suitMode)));
}
