import type { SpiderSuitMode } from "@/lib/games/spider/types";

export const SPIDER_SUIT_LABELS: Record<SpiderSuitMode, string> = {
  1: "1 масть (лёгкий)",
  2: "2 масти (средний)",
  4: "4 масти (сложный)",
};

/** Vertical overlap between stacked cards as a ratio of card height. */
export const SPIDER_CARD_OFFSET_RATIO = 0.22;

export const SPIDER_UNDO_LIMIT = 80;

/** Table felt color */
export const SPIDER_FELT = "#BBCFC3";
export const SPIDER_FELT_BORDER = "#9FB5A9";
