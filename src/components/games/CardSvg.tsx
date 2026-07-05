import type { PlayingCard } from "@/lib/games/cards/types";

const SUIT_SYMBOL: Record<PlayingCard["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  spades: "♠",
  hearts: "♥",
};

const SUIT_CODE: Record<PlayingCard["suit"], "C" | "D" | "S" | "H"> = {
  clubs: "C",
  diamonds: "D",
  spades: "S",
  hearts: "H",
};

function rankLabel(rank: PlayingCard["rank"]): string {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

function cardAssetPath(card: PlayingCard): string {
  return `/tools/games/cards/${rankLabel(card.rank)}${SUIT_CODE[card.suit]}.svg`;
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
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/tools/games/cards/BACK.svg"
        alt="Card back"
        className={`${className} rounded-md object-contain`}
        loading="lazy"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cardAssetPath(card)}
      alt={`${rankLabel(card.rank)} ${SUIT_SYMBOL[card.suit]}`}
      className={`${className} rounded-md object-contain`}
      loading="lazy"
    />
  );
}
