"use client";

import { CardSvg } from "@/components/games/CardSvg";
import type { PlayingCard } from "@/lib/games/cards/types";

/** Card face aspect — same as Hearts (`223×312`). */
export const CARD_ASPECT_CLASS = "aspect-[223/312]";

/** Single clean frame — same idea as HeartsHand, slightly stronger shadow. */
export function cardShellClass(options: {
  mini?: boolean;
  interactive?: boolean;
  selected?: boolean;
  hint?: boolean;
}): string {
  const { mini, interactive, selected, hint } = options;
  const parts = [
    "rounded-md border bg-white dark:bg-gray-900 block overflow-hidden",
    selected
      ? "border-amber-500 ring-2 ring-amber-300 -translate-y-0.5"
      : hint
        ? "border-emerald-500 ring-2 ring-emerald-300"
        : "border-gray-400 dark:border-gray-500",
  ];

  parts.push(
    mini
      ? "shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
      : "shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.1)]",
  );

  if (interactive) {
    parts.push(
      "transition-[transform,box-shadow] duration-150 ease-out",
      "hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(0,0,0,0.2),0_8px_22px_rgba(0,0,0,0.12)]",
    );
  }

  return parts.join(" ");
}

/** Card image fills the frame edge-to-edge (no inner padding/rings). */
export const CARD_IMG_CLASS = `w-full ${CARD_ASPECT_CLASS} block !rounded-none object-cover !drop-shadow-none`;

export function SpiderCard({
  card,
  hidden = false,
  className = "",
  mini = false,
  placeholder = false,
  interactive = false,
  selected = false,
  hint = false,
  fill = false,
}: {
  card?: PlayingCard;
  hidden?: boolean;
  className?: string;
  mini?: boolean;
  placeholder?: boolean;
  interactive?: boolean;
  selected?: boolean;
  hint?: boolean;
  fill?: boolean;
}) {
  if (placeholder || !card) {
    return (
      <div
        className={`rounded-md border-2 border-dashed border-slate-400/55 bg-slate-500/5 ${CARD_ASPECT_CLASS} ${className}`}
      />
    );
  }

  return (
    <div className={`${cardShellClass({ mini, interactive, selected, hint })} ${className}`}>
      <CardSvg
        card={card}
        hidden={hidden}
        className={fill ? "w-full h-full block rounded-none object-cover drop-shadow-none" : CARD_IMG_CLASS}
      />
    </div>
  );
}
