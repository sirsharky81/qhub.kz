import type { PlayingCard } from "@/lib/games/cards/types";
import type { HeartsAction, HeartsState } from "./types";

function getPlayerIndex(state: HeartsState, playerId: string): number {
  return state.players.findIndex((player) => player.id === playerId);
}

function hasSuit(hand: readonly PlayingCard[], suit: PlayingCard["suit"]): boolean {
  return hand.some((card) => card.suit === suit);
}

function onlyHeartsOrQueenSpades(hand: readonly PlayingCard[]): boolean {
  return hand.every((card) => card.suit === "hearts" || (card.suit === "spades" && card.rank === 12));
}

function isQueenSpades(card: PlayingCard): boolean {
  return card.suit === "spades" && card.rank === 12;
}

function isFirstTrick(state: HeartsState): boolean {
  return state.players.every((player) => player.takenCards.length === 0) && state.lastTrick.length === 0;
}

export function legalCardsForPlayer(state: HeartsState, playerId: string): PlayingCard[] {
  const idx = getPlayerIndex(state, playerId);
  if (idx === -1 || state.phase !== "playing") return [];
  const player = state.players[idx]!;
  if (state.currentTurnId !== player.id) return [];

  const hand = player.hand;
  if (hand.length === 0) return [];
  const firstTrick = isFirstTrick(state);
  const isLead = state.trick.cards.length === 0;
  const leadSuit = state.trick.leadSuit;

  if (firstTrick && isLead) {
    return hand.filter((card) => card.suit === "clubs" && card.rank === 2);
  }

  if (isLead) {
    if (state.heartsBroken || !hasSuit(hand, "hearts") || onlyHeartsOrQueenSpades(hand)) {
      return hand;
    }
    return hand.filter((card) => card.suit !== "hearts");
  }

  if (!leadSuit) return hand;
  if (hasSuit(hand, leadSuit)) {
    return hand.filter((card) => card.suit === leadSuit);
  }

  if (firstTrick) {
    const safe = hand.filter((card) => card.suit !== "hearts" && !isQueenSpades(card));
    return safe.length > 0 ? safe : hand;
  }

  return hand;
}

export function isActionLegal(state: HeartsState, action: HeartsAction): { ok: boolean; reason?: string } {
  if (action.type === "select_pass_cards") {
    if (state.phase !== "passing") return { ok: false, reason: "Фаза обмена карт уже завершена" };
    const player = state.players.find((p) => p.id === action.playerId);
    if (!player) return { ok: false, reason: "Неизвестный игрок" };
    if (action.cardIds.length !== 3 && state.passDirection !== "none") {
      return { ok: false, reason: "Нужно выбрать ровно 3 карты" };
    }
    const unique = new Set(action.cardIds);
    if (unique.size !== action.cardIds.length) {
      return { ok: false, reason: "Нельзя выбрать одну и ту же карту дважды" };
    }
    const handSet = new Set(player.hand.map((card) => card.id));
    const allInHand = action.cardIds.every((cardId) => handSet.has(cardId));
    if (!allInHand) return { ok: false, reason: "Нельзя передать карту, которой нет на руках" };
    return { ok: true };
  }

  if (action.type === "auto_fill_pass") {
    return { ok: state.phase === "passing", reason: "Автовыбор возможен только в фазе обмена" };
  }

  if (action.type === "play_card") {
    if (state.phase !== "playing") return { ok: false, reason: "Сейчас не фаза хода" };
    if (state.currentTurnId !== action.playerId) return { ok: false, reason: "Сейчас ход другого игрока" };
    const legal = legalCardsForPlayer(state, action.playerId);
    const chosen = legal.find((card) => card.id === action.cardId);
    if (!chosen) return { ok: false, reason: "Этой картой сейчас ходить нельзя" };
    return { ok: true };
  }

  return { ok: false, reason: "Неизвестное действие" };
}
