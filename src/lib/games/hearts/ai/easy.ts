import { pickRandom } from "@/lib/games/shared/random";
import type { AiStrategy } from "@/lib/games/ai/types";
import type { HeartsAction, HeartsState } from "../types";

export const heartsEasyStrategy: AiStrategy<HeartsState, HeartsAction> = {
  id: "easy",
  chooseAction: ({ legalActions }) => {
    if (legalActions.length === 0) return null;
    return pickRandom(legalActions);
  },
};
