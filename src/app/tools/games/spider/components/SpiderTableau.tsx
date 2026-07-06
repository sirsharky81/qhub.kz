"use client";

import { useMemo, useRef } from "react";
import { SPIDER_CARD_OFFSET_RATIO } from "../constants";
import { useCoarsePointer } from "../hooks/useCoarsePointer";
import { useLandscapePhone } from "../hooks/useLandscapePhone";
import { useSpiderTableauMetrics } from "../hooks/useSpiderTableauMetrics";
import { CardSvg } from "@/components/games/CardSvg";
import { CARD_IMG_CLASS, cardShellClass } from "./SpiderCard";
import {
  getLegalMoveTargets,
  isValidMoveStackSegment,
} from "@/lib/games/spider/validators";
import type { SpiderHint } from "@/lib/games/spider/hint";
import type { SpiderColumnCard, SpiderState } from "@/lib/games/spider/types";

export interface SpiderSelection {
  fromColumn: number;
  fromIndex: number;
}

const TOUCH_OFFSET_RATIO = 0.28;

function largestMovableIndex(column: SpiderColumnCard[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < column.length; i++) {
    if (!column[i].faceUp) break;
    if (isValidMoveStackSegment(column.slice(i))) best = i;
  }
  return best;
}

export function SpiderTableau({
  columns,
  selection,
  legalTargets,
  hint,
  onSelect,
  onMoveToColumn,
}: {
  columns: SpiderColumnCard[][];
  selection: SpiderSelection | null;
  legalTargets: Set<number>;
  hint: SpiderHint | null;
  onSelect: (fromColumn: number, fromIndex: number) => void;
  onMoveToColumn: (toColumn: number) => void;
}) {
  const isTouch = useCoarsePointer();
  const isLandscapePhone = useLandscapePhone();
  const hostRef = useRef<HTMLDivElement>(null);
  const maxColumnDepth = useMemo(
    () => Math.max(1, ...columns.map((column) => column.length)),
    [columns],
  );
  const offsetRatio = isTouch ? TOUCH_OFFSET_RATIO : SPIDER_CARD_OFFSET_RATIO;
  const metrics = useSpiderTableauMetrics(
    hostRef,
    maxColumnDepth,
    offsetRatio,
    isLandscapePhone,
  );

  const fitsWidth = isLandscapePhone && metrics.fitsWidth;

  const cardStyle = isLandscapePhone
    ? ({
        "--spider-card-w": `${metrics.cardW}px`,
        "--spider-card-h": `${metrics.cardH}px`,
        "--spider-card-offset": `${metrics.offset}px`,
      } as React.CSSProperties)
    : ({
        "--spider-card-w": "clamp(58px, calc((100vw - 2.5rem) / 10 - 2px), 92px)",
        "--spider-card-h": "calc(var(--spider-card-w) * 312 / 223)",
        "--spider-card-offset": `calc(var(--spider-card-h) * ${offsetRatio})`,
      } as React.CSSProperties);

  return (
    <div
      ref={hostRef}
      className={
        isLandscapePhone ? "h-full min-h-0 flex flex-col min-w-0" : "space-y-2"
      }
    >
      {isTouch && !isLandscapePhone && (
        <p className="text-[11px] text-center text-emerald-950/85 sm:hidden px-2 leading-snug">
          {selection
            ? "Нажмите подсвеченный столбец для хода"
            : "Нажмите карту или столбец — затем столбец назначения"}
        </p>
      )}
      <div
        className={
          isLandscapePhone
            ? `spider-tableau flex-1 min-h-0 w-full overflow-y-visible pb-1 pt-0.5 ${
                fitsWidth
                  ? "overflow-x-hidden"
                  : "overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]"
              }`
            : "spider-tableau w-full overflow-x-auto overflow-y-visible pb-2 pt-1 overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]"
        }
        style={cardStyle}
      >
        <div
          className={
            isLandscapePhone
              ? `flex justify-between gap-[2px] h-full px-0.5 ${fitsWidth ? "w-full" : "min-w-full w-max"}`
              : "flex justify-between gap-[2px] sm:gap-1 min-w-full w-max sm:w-full px-0.5"
          }
        >
          {columns.map((column, colIndex) => {
            const isHintTarget = hint?.type === "move_stack" && hint.toColumn === colIndex;
            const isTarget = legalTargets.has(colIndex) || isHintTarget;

            const columnHeight =
              column.length === 0
                ? "var(--spider-card-h)"
                : `calc(var(--spider-card-h) + ${column.length - 1} * var(--spider-card-offset))`;

            return (
              <div
                key={colIndex}
                data-spider-col={colIndex}
                className={`relative shrink-0 flex-1 rounded-lg transition-shadow duration-200 ${
                  isLandscapePhone
                    ? fitsWidth
                      ? "min-w-0 max-w-none"
                      : "max-w-[92px]"
                    : "max-w-[92px]"
                } ${
                  isTarget
                    ? "ring-2 ring-emerald-600/90 shadow-[0_0_0_3px_rgba(5,150,105,0.25)]"
                    : ""
                } ${isHintTarget ? "animate-[spiderHintPulse_1.2s_ease-in-out_infinite]" : ""}`}
                style={{
                  width: isLandscapePhone && fitsWidth ? undefined : "var(--spider-card-w)",
                  flexBasis: isLandscapePhone && fitsWidth ? 0 : undefined,
                  minHeight: columnHeight,
                }}
                onClick={() => {
                  if (selection && legalTargets.has(colIndex)) {
                    onMoveToColumn(colIndex);
                    return;
                  }
                  if (isTouch && !selection && column.length > 0) {
                    const fromIndex = largestMovableIndex(column);
                    if (fromIndex !== null) onSelect(colIndex, fromIndex);
                  }
                }}
                onDragOver={(event) => {
                  if (legalTargets.has(colIndex)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (selection && legalTargets.has(colIndex)) {
                    onMoveToColumn(colIndex);
                  }
                }}
              >
                {column.length === 0 ? (
                  <button
                    type="button"
                    className="absolute inset-x-0 top-0 rounded-md border-2 border-dashed border-slate-500/50 bg-slate-600/10 touch-manipulation"
                    style={{
                      height: "var(--spider-card-h)",
                      minHeight: isLandscapePhone ? 32 : 44,
                    }}
                    onClick={() => {
                      if (selection && legalTargets.has(colIndex)) {
                        onMoveToColumn(colIndex);
                      }
                    }}
                  />
                ) : (
                  column.map((entry, cardIndex) => {
                    const isInSelectedStack =
                      selection?.fromColumn === colIndex && cardIndex >= selection.fromIndex;
                    const segment = column.slice(cardIndex);
                    const canDrag = isValidMoveStackSegment(segment);
                    const isHintCard =
                      hint?.type === "move_stack" &&
                      hint.fromColumn === colIndex &&
                      cardIndex >= hint.fromIndex;

                    return (
                      <button
                        key={`${entry.card.id}-${cardIndex}`}
                        type="button"
                        data-spider-card={`${colIndex}-${cardIndex}`}
                        draggable={!isTouch && entry.faceUp && canDrag}
                        onDragStart={(event) => {
                          if (isTouch || !entry.faceUp || !canDrag) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.setData(
                            "application/x-spider-move",
                            JSON.stringify({ fromColumn: colIndex, fromIndex: cardIndex }),
                          );
                          event.dataTransfer.effectAllowed = "move";
                          onSelect(colIndex, cardIndex);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            selection &&
                            legalTargets.has(colIndex) &&
                            selection.fromColumn !== colIndex
                          ) {
                            onMoveToColumn(colIndex);
                            return;
                          }
                          if (!entry.faceUp || !canDrag) return;
                          onSelect(colIndex, cardIndex);
                        }}
                        className={`absolute left-0 w-full touch-manipulation select-none active:scale-[0.98] ${cardShellClass({
                          interactive: entry.faceUp && canDrag,
                          selected: isInSelectedStack,
                          hint: isHintCard && !isInSelectedStack,
                        })}`}
                        style={{
                          top: `calc(${cardIndex} * var(--spider-card-offset))`,
                          zIndex: cardIndex + 1,
                          minHeight:
                            isTouch && entry.faceUp
                              ? `max(var(--spider-card-offset), ${isLandscapePhone ? 22 : 28}px)`
                              : undefined,
                        }}
                      >
                        <CardSvg
                          card={entry.card}
                          hidden={!entry.faceUp}
                          className={CARD_IMG_CLASS}
                        />
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style jsx global>{`
        @keyframes spiderHintPulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.45);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(5, 150, 105, 0);
          }
        }
      `}</style>
    </div>
  );
}

export function computeLegalTargets(state: SpiderState, selection: SpiderSelection | null): Set<number> {
  if (!selection) return new Set();
  return new Set(getLegalMoveTargets(state, selection.fromColumn, selection.fromIndex));
}
