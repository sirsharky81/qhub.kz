import { CARD_RANKS, CARD_SUITS, cardId, type CardRank, type CardSuit } from "./types";

export interface CardAssetDescriptor {
  id: string;
  suit: CardSuit;
  rank: CardRank;
}

export const CARD_ASSET_MAP: Record<string, CardAssetDescriptor> = Object.fromEntries(
  CARD_SUITS.flatMap((suit) =>
    CARD_RANKS.map((rank) => {
      const id = cardId(suit, rank);
      return [id, { id, suit, rank }];
    }),
  ),
);

export const CARD_BACK_ASSET_ID = "CARD_BACK";
