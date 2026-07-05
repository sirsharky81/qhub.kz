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

type PipPoint = { x: number; y: number; rotate?: boolean };

const PIP_LAYOUTS: Record<number, PipPoint[]> = {
  2: [
    { x: 60, y: 46 },
    { x: 60, y: 124, rotate: true },
  ],
  3: [
    { x: 60, y: 44 },
    { x: 60, y: 85 },
    { x: 60, y: 126, rotate: true },
  ],
  4: [
    { x: 42, y: 45 },
    { x: 78, y: 45 },
    { x: 42, y: 125, rotate: true },
    { x: 78, y: 125, rotate: true },
  ],
  5: [
    { x: 42, y: 45 },
    { x: 78, y: 45 },
    { x: 60, y: 85 },
    { x: 42, y: 125, rotate: true },
    { x: 78, y: 125, rotate: true },
  ],
  6: [
    { x: 42, y: 40 },
    { x: 78, y: 40 },
    { x: 42, y: 85 },
    { x: 78, y: 85 },
    { x: 42, y: 130, rotate: true },
    { x: 78, y: 130, rotate: true },
  ],
  7: [
    { x: 42, y: 40 },
    { x: 78, y: 40 },
    { x: 60, y: 62 },
    { x: 42, y: 85 },
    { x: 78, y: 85 },
    { x: 42, y: 130, rotate: true },
    { x: 78, y: 130, rotate: true },
  ],
  8: [
    { x: 42, y: 38 },
    { x: 78, y: 38 },
    { x: 42, y: 67 },
    { x: 78, y: 67 },
    { x: 42, y: 103, rotate: true },
    { x: 78, y: 103, rotate: true },
    { x: 42, y: 132, rotate: true },
    { x: 78, y: 132, rotate: true },
  ],
  9: [
    { x: 42, y: 36 },
    { x: 78, y: 36 },
    { x: 42, y: 62 },
    { x: 78, y: 62 },
    { x: 60, y: 85 },
    { x: 42, y: 108, rotate: true },
    { x: 78, y: 108, rotate: true },
    { x: 42, y: 134, rotate: true },
    { x: 78, y: 134, rotate: true },
  ],
  10: [
    { x: 42, y: 34 },
    { x: 78, y: 34 },
    { x: 42, y: 58 },
    { x: 78, y: 58 },
    { x: 60, y: 78 },
    { x: 42, y: 92, rotate: true },
    { x: 78, y: 92, rotate: true },
    { x: 42, y: 112, rotate: true },
    { x: 78, y: 112, rotate: true },
    { x: 60, y: 136, rotate: true },
  ],
};

function renderFaceArt(rank: PlayingCard["rank"], suit: PlayingCard["suit"], fill: string) {
  const symbol = SUIT_SYMBOL[suit];
  return (
    <g>
      <rect x="29" y="34" width="62" height="102" rx="6" fill="#f8fafc" stroke={fill} strokeWidth="1.25" />
      <path d="M33 52h54M33 118h54" stroke={fill} strokeOpacity="0.45" />
      <circle cx="60" cy="85" r="16" fill={fill} fillOpacity="0.09" stroke={fill} strokeOpacity="0.35" />
      <text x="60" y="90" textAnchor="middle" fontSize="24" fontWeight="700" fill={fill}>
        {symbol}
      </text>
      <text x="60" y="55" textAnchor="middle" fontSize="20" fontWeight="700" fill={fill}>
        {rankLabel(rank)}
      </text>
      <g transform="translate(60 115) rotate(180)">
        <text x="0" y="0" textAnchor="middle" fontSize="20" fontWeight="700" fill={fill}>
          {rankLabel(rank)}
        </text>
      </g>
    </g>
  );
}

function renderPipLayout(rank: PlayingCard["rank"], suit: PlayingCard["suit"], fill: string) {
  if (rank === 14) {
    return (
      <text x="60" y="100" textAnchor="middle" fontSize="56" fill={fill}>
        {SUIT_SYMBOL[suit]}
      </text>
    );
  }
  if (rank >= 11) {
    return renderFaceArt(rank, suit, fill);
  }
  const points = PIP_LAYOUTS[rank] ?? [];
  return (
    <>
      {points.map((point, idx) => (
        <text
          key={`${rank}-${idx}`}
          x={point.x}
          y={point.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="23"
          fill={fill}
          transform={point.rotate ? `rotate(180 ${point.x} ${point.y})` : undefined}
        >
          {SUIT_SYMBOL[suit]}
        </text>
      ))}
    </>
  );
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
        <defs>
          <pattern id="qhub-card-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 0h12M0 0v12" stroke="#c7d2fe" strokeOpacity="0.5" strokeWidth="0.75" />
            <circle cx="6" cy="6" r="1.5" fill="#e0e7ff" fillOpacity="0.45" />
          </pattern>
        </defs>
        <rect x="2" y="2" width="116" height="166" rx="10" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="3" />
        <rect x="10" y="10" width="100" height="150" rx="8" fill="url(#qhub-card-grid)" stroke="#bfdbfe" strokeWidth="1.5" />
        <rect x="19" y="19" width="82" height="132" rx="7" fill="none" stroke="#dbeafe" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="60" cy="85" r="15" fill="#eff6ff" fillOpacity="0.9" />
        <text x="60" y="91" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e40af">Q</text>
      </svg>
    );
  }

  const red = card.suit === "diamonds" || card.suit === "hearts";
  const fill = red ? "#dc2626" : "#111111";
  const label = rankLabel(card.rank);

  return (
    <svg
      viewBox="0 0 120 170"
      className={className}
      role="img"
      aria-label={`${rankLabel(card.rank)} ${SUIT_SYMBOL[card.suit]}`}
    >
      <rect x="2" y="2" width="116" height="166" rx="10" fill="#ffffff" stroke="#b6b6b6" strokeWidth="2.2" />
      <rect x="7" y="7" width="106" height="156" rx="8" fill="none" stroke="#f3f4f6" />

      <text x="11" y="24" fontSize="17" fontWeight="700" fill={fill}>
        {label}
      </text>
      <text x="11" y="41" fontSize="17" fill={fill}>
        {SUIT_SYMBOL[card.suit]}
      </text>
      {renderPipLayout(card.rank, card.suit, fill)}
      <g transform="translate(109 146) rotate(180)">
        <text x="0" y="24" fontSize="17" fontWeight="700" fill={fill}>
          {label}
        </text>
        <text x="0" y="41" fontSize="17" fill={fill}>
          {SUIT_SYMBOL[card.suit]}
        </text>
      </g>
    </svg>
  );
}
