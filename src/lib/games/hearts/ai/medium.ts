import type { AiStrategy } from "@/lib/games/ai/types";
import type { HeartsAction, HeartsState } from "../types";

function cardRisk(cardId: string): number {
  if (cardId === "QS") return 500;
  const isHeart = cardId.endsWith("H");
  if (isHeart) return 100;
  return 0;
}

function rankWeight(cardId: string): number {
  const rank = cardId.slice(0, -1);
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export const heartsMediumStrategy: AiStrategy<HeartsState, HeartsAction> = {
  id: "medium",
  chooseAction: ({ legalActions, state }) => {
    if (legalActions.length === 0) return null;
    const passAction = legalActions.find((action) => action.type === "select_pass_cards");
    if (passAction) return passAction;

    const playActions = legalActions.filter((action) => action.type === "play_card");
    if (playActions.length === 0) return legalActions[0] ?? null;

    // Средний уровень старается первым делом избавиться от штрафных карт, если это легально.
    const byScore = [...playActions].sort((a, b) => {
      const ar = cardRisk(a.cardId) + rankWeight(a.cardId);
      const br = cardRisk(b.cardId) + rankWeight(b.cardId);
      return br - ar;
    });
    const leadCode =
      state.trick.leadSuit === "clubs"
        ? "C"
        : state.trick.leadSuit === "diamonds"
          ? "D"
          : state.trick.leadSuit === "spades"
            ? "S"
            : state.trick.leadSuit === "hearts"
              ? "H"
              : null;
    const canDumpPenalty =
      state.trick.cards.length > 0 &&
      Boolean(leadCode) &&
      !playActions.every((action) => action.cardId.endsWith(leadCode!));
    if (canDumpPenalty) {
      return byScore[0]!;
    }

    return [...playActions].sort((a, b) => rankWeight(a.cardId) - rankWeight(b.cardId))[0]!;
  },
};
