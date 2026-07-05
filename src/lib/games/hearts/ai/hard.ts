import type { AiStrategy } from "@/lib/games/ai/types";
import type { HeartsAction, HeartsState } from "../types";

function rankValue(cardId: string): number {
  const rank = cardId.slice(0, -1);
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

function penaltyValue(cardId: string): number {
  if (cardId === "QS") return 13;
  if (cardId.endsWith("H")) return 1;
  return 0;
}

function actionScore(state: HeartsState, action: Extract<HeartsAction, { type: "play_card" }>): number {
  const rank = rankValue(action.cardId);
  const penalty = penaltyValue(action.cardId);
  const isLead = state.trick.cards.length === 0;
  const leadSuitCode =
    state.trick.leadSuit === "clubs"
      ? "C"
      : state.trick.leadSuit === "diamonds"
        ? "D"
        : state.trick.leadSuit === "spades"
          ? "S"
          : state.trick.leadSuit === "hearts"
            ? "H"
            : null;
  const follows = leadSuitCode ? action.cardId.endsWith(leadSuitCode) : false;

  if (!isLead && !follows) {
    // Лучшая ситуация для сброса штрафных карт.
    return 100 + penalty * 20 + rank;
  }
  if (isLead && action.cardId.endsWith("H") && !state.heartsBroken) {
    return -1000;
  }
  // Избегаем взятия: понижаем оценку у высоких карт в масть.
  return penalty * 5 - rank;
}

export const heartsHardStrategy: AiStrategy<HeartsState, HeartsAction> = {
  id: "hard",
  chooseAction: ({ legalActions, state }) => {
    if (legalActions.length === 0) return null;
    const passAction = legalActions.find((action) => action.type === "select_pass_cards");
    if (passAction) return passAction;
    const playActions = legalActions.filter(
      (action): action is Extract<HeartsAction, { type: "play_card" }> => action.type === "play_card",
    );
    if (playActions.length === 0) return legalActions[0] ?? null;
    return [...playActions].sort((a, b) => actionScore(state, b) - actionScore(state, a))[0]!;
  },
};
