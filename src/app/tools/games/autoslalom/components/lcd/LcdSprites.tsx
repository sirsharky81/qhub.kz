"use client";

/** Формульный автомобиль SPORT — сегменты ЖК ИМ-23 (локальные координаты). */
export function LcdCarSprite({ color }: { color: string }) {
  return (
    <g fill={color} stroke="none">
      {/* Корпус */}
      <rect x="-19" y="-3" width="38" height="7" rx="0.5" />
      {/* Нос */}
      <polygon points="10,-6 22,-4 22,1 10,2" />
      {/* Кокpit / шлем */}
      <circle cx="-1" cy="-4" r="3.2" />
      <rect x="-4" y="-5.5" width="6" height="2" rx="0.5" />
      {/* Заднее крыло */}
      <rect x="-22" y="-9" width="7" height="2" />
      <rect x="-22" y="4" width="7" height="2" />
      {/* Переднее крыло */}
      <rect x="14" y="-5" width="4" height="8" />
      {/* Колёса */}
      <rect x="-14" y="0" width="8" height="7" rx="0.5" />
      <rect x="7" y="0" width="8" height="7" rx="0.5" />
      {/* Протектор */}
      <rect x="-13" y="2" width="6" height="1" fill={color} opacity="0.35" />
      <rect x="-13" y="5" width="6" height="1" fill={color} opacity="0.35" />
      <rect x="8" y="2" width="6" height="1" fill={color} opacity="0.35" />
      <rect x="8" y="5" width="6" height="1" fill={color} opacity="0.35" />
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
