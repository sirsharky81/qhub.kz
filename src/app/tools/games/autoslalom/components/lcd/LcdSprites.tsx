"use client";

/** Формульный автомобиль SPORT — сегменты ЖК ИМ-23 (локальные координаты). */
export function LcdCarSprite({ color }: { color: string }) {
  return (
    <g fill={color} stroke="none">
      {/* Заднее антикрыло и корпус формулы. */}
      <rect x="-23" y="-10" width="8" height="2" />
      <rect x="-23" y="5" width="8" height="2" />
      <rect x="-20" y="-6" width="33" height="11" rx="0.5" />
      {/* Нос, переднее крыло и стойки. */}
      <polygon points="11,-6 23,-4 24,0 11,3" />
      <rect x="18" y="-8" width="3" height="12" />
      <rect x="21" y="-7" width="5" height="2" />
      <rect x="21" y="2" width="5" height="2" />
      {/* Кокпит и шлем пилота. */}
      <rect x="-6" y="-8" width="10" height="5" rx="1" />
      <circle cx="-1" cy="-9" r="3.5" />
      {/* Колёса с дискретными прорезями протектора. */}
      <rect x="-15" y="-3" width="8" height="10" rx="0.5" />
      <rect x="7" y="-3" width="8" height="10" rx="0.5" />
      <rect x="-14" y="0" width="6" height="1.2" fill="#b8c8a8" />
      <rect x="-14" y="3.5" width="6" height="1.2" fill="#b8c8a8" />
      <rect x="8" y="0" width="6" height="1.2" fill="#b8c8a8" />
      <rect x="8" y="3.5" width="6" height="1.2" fill="#b8c8a8" />
      {/* SPORT */}
      <text
        x="0"
        y="1"
        textAnchor="middle"
        fontSize="5"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        fill={color}
      >
        SPORT
      </text>
    </g>
  );
}

/** Мини-авто для индикатора жизней. */
export function LcdLifeSprite({ color, outline }: { color: string; outline?: boolean }) {
  return (
    <g fill={outline ? "none" : color} stroke={color} strokeWidth="0.8">
      <rect x="0" y="2" width="12" height="5" />
      <rect x="2" y="0" width="8" height="3" />
    </g>
  );
}

export function LcdCheckeredFlag({ x, y, size }: { x: number; y: number; size: number }) {
  const cell = size / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x + c * cell}
          y={y + r * cell}
          width={cell + 0.2}
          height={cell + 0.2}
          fill={(r + c) % 2 ? "#141414" : "#b8c8a8"}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}
