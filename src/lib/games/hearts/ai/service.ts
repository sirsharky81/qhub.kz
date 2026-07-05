import { GameAiService } from "@/lib/games/ai/service";
import type { HeartsAction, HeartsState } from "../types";
import { heartsEasyStrategy } from "./easy";
import { heartsHardStrategy } from "./hard";
import { heartsMediumStrategy } from "./medium";

export const heartsAiService = new GameAiService<HeartsState, HeartsAction>({
  easy: heartsEasyStrategy,
  medium: heartsMediumStrategy,
  hard: heartsHardStrategy,
});
