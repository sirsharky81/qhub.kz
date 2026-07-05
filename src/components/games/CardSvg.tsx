import type { PlayingCard } from "@/lib/games/cards/types";

const SUIT_SYMBOL: Record<PlayingCard["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  spades: "♠",
  hearts: "♥",
};

function rankLabel(rank: PlayingCard["rank"]): string {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

export function CardSvg({
  card,
  hidden = false,
  className = "",
}: {
  card: PlayingCard;
  hidden?: boolean;
  className?: string;
}) {
  if (hidden) {
    return (
      <svg
        viewBox="0 0 120 170"
        className={className}
        role="img"
        aria-label="Card back"
      >
        <rect x="2" y="2" width="116" height="166" rx="10" fill="#1e293b" stroke="#64748b" strokeWidth="3" />
        <rect x="14" y="14" width="92" height="142" rx="8" fill="#334155" />
        <path d="M20 34h80M20 54h80M20 74h80M20 94h80M20 114h80M20 134h80" stroke="#64748b" strokeWidth="2" />
      </svg>
    );
  }

  const red = card.suit === "diamonds" || card.suit === "hearts";
  const fill = red ? "#dc2626" : "#111827";

  return (
    <svg
      viewBox="0 0 120 170"
      className={className}
      role="img"
      aria-label={`${rankLabel(card.rank)} ${SUIT_SYMBOL[card.suit]}`}
    >
      <rect x="2" y="2" width="116" height="166" rx="10" fill="#ffffff" stroke="#d1d5db" strokeWidth="3" />
      <text x="12" y="24" fontSize="18" fontWeight="700" fill={fill}>
        {rankLabel(card.rank)}
      </text>
      <text x="11" y="44" fontSize="18" fill={fill}>
        {SUIT_SYMBOL[card.suit]}
      </text>
      <text x="60" y="96" textAnchor="middle" fontSize="44" fill={fill}>
        {SUIT_SYMBOL[card.suit]}
      </text>
      <g transform="translate(108 150) rotate(180)">
        <text x="12" y="24" fontSize="18" fontWeight="700" fill={fill}>
          {rankLabel(card.rank)}
        </text>
        <text x="11" y="44" fontSize="18" fill={fill}>
          {SUIT_SYMBOL[card.suit]}
        </text>
      </g>
    </svg>
  );
}
