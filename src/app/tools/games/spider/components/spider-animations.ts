"use client";

import type { CardSuit } from "@/lib/games/cards/types";
import type { PlayingCard } from "@/lib/games/cards/types";
import type { SpiderAction, SpiderState } from "@/lib/games/spider/types";
import { findRunsCompletedByAction } from "@/lib/games/spider/simulate";
import type { SpiderFlyItem } from "./SpiderAnimationLayer";
import { rectToFlyBox } from "./SpiderAnimationLayer";

function queryRect(selector: string): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  return el?.getBoundingClientRect() ?? null;
}

function cardRect(col: number, index: number): DOMRect | null {
  return queryRect(`[data-spider-card="${col}-${index}"]`);
}

function columnTopRect(col: number): DOMRect | null {
  const colEl = document.querySelector(`[data-spider-col="${col}"]`);
  if (!colEl) return null;
  return colEl.getBoundingClientRect();
}

export function buildMoveFlyItems(
  prev: SpiderState,
  action: Extract<SpiderAction, { type: "move_stack" }>,
): SpiderFlyItem[] {
  const fromRect = cardRect(action.fromColumn, action.fromIndex);
  const targetCol = prev.columns[action.toColumn]!;
  const toIndex = targetCol.length;
  const toRect = cardRect(action.toColumn, toIndex) ?? columnTopRect(action.toColumn);
  if (!fromRect || !toRect) return [];

  const segment = prev.columns[action.fromColumn]!.slice(action.fromIndex);
  const fromBox = rectToFlyBox(fromRect);
  const toBox = rectToFlyBox(toRect);

  return segment.map((entry, i) => ({
    id: `move-${action.fromColumn}-${action.fromIndex}-${i}-${Date.now()}`,
    card: entry.card,
    from: { ...fromBox, y: fromBox.y + i * fromBox.h * 0.22 },
    to: { ...toBox, y: toBox.y + i * toBox.h * 0.22 },
    delayMs: i * 30,
    durationMs: 280,
  }));
}

export function buildDealFlyItems(prev: SpiderState): SpiderFlyItem[] {
  const stockRect = queryRect("[data-spider-stock]");
  if (!stockRect) return [];
  const stockBox = rectToFlyBox(stockRect);
  const cards = prev.stock.slice(0, 10);
  const items: SpiderFlyItem[] = [];

  for (let col = 0; col < 10; col++) {
    const colLen = prev.columns[col]!.length;
    const dest =
      cardRect(col, colLen) ?? columnTopRect(col);
    if (!dest) continue;
    const toBox = rectToFlyBox(dest);
    items.push({
      id: `deal-${col}-${Date.now()}`,
      card: cards[col]!,
      from: stockBox,
      to: toBox,
      delayMs: col * 45,
      durationMs: 340,
    });
  }
  return items;
}

export function buildFoundationFlyItems(
  prev: SpiderState,
  action: SpiderAction,
  completedSuits: CardSuit[],
  runsAdded: number,
): SpiderFlyItem[] {
  const runs = findRunsCompletedByAction(prev, action);
  if (runs.length === 0 && runsAdded <= 0) return [];

  const items: SpiderFlyItem[] = [];
  const startFoundationIndex = completedSuits.length - runsAdded;

  runs.slice(0, runsAdded).forEach((run, i) => {
    const from =
      cardRect(run.column, prev.columns[run.column]!.length - 13) ??
      columnTopRect(run.column);
    const foundationRect = queryRect(`[data-spider-foundation=${startFoundationIndex + i}]`);
    if (!from || !foundationRect) return;
    const kingCard: PlayingCard = { id: `K-${run.suit}`, suit: run.suit, rank: 13 };
    items.push({
      id: `foundation-${i}-${Date.now()}`,
      card: kingCard,
      from: rectToFlyBox(from),
      to: rectToFlyBox(foundationRect),
      durationMs: 480,
      delayMs: 80,
    });
  });
  return items;
}
