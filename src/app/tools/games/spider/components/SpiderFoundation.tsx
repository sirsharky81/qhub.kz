"use client";

import { cardId, type CardSuit, type PlayingCard } from "@/lib/games/cards/types";
import { CARD_ASPECT_CLASS, SpiderCard } from "./SpiderCard";

function foundationTopCard(suit: CardSuit): PlayingCard {
  return { id: cardId(suit, 13), suit, rank: 13 };
}

export function SpiderFoundation({
  completedRuns,
  completedSuits,
  pulseIndex,
}: {
  completedRuns: number;
  completedSuits: CardSuit[];
  pulseIndex: number | null;
}) {
  return (
    <div
      className="flex items-end gap-1.5 sm:gap-2 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] max-w-full pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-spider-foundation-row
    >
      {Array.from({ length: 8 }).map((_, index) => {
        const filled = index < completedRuns;
        const suit = completedSuits[index];
        const pulsing = pulseIndex === index;
        return (
          <div
            key={index}
            data-spider-foundation={index}
            className={`relative w-[clamp(30px,4.2vw,46px)] shrink-0 transition-transform duration-300 ${
              pulsing ? "scale-105 -translate-y-1" : ""
            }`}
          >
            {filled && suit ? (
              <div className="relative w-full">
                {[0, 1, 2].map((layer) => (
                  <div
                    key={layer}
                    className={`absolute left-0 top-0 w-full ${layer === 0 ? "relative" : ""}`}
                    style={layer > 0 ? { transform: `translateY(${layer * 2}px)` } : undefined}
                  >
                    <SpiderCard
                      card={foundationTopCard(suit)}
                      mini
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <SpiderCard placeholder className="w-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}
