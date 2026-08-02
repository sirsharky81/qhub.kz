"use client";

const SEG: Record<string, boolean[]> = {
  "0": [true, true, true, false, true, true, true],
  "1": [false, false, true, false, false, true, false],
  "2": [true, false, true, true, true, false, true],
  "3": [true, false, true, true, false, true, true],
  "4": [false, true, true, true, false, true, false],
  "5": [true, true, false, true, false, true, true],
  "6": [true, true, false, true, true, true, true],
  "7": [true, false, true, false, false, true, false],
  "8": [true, true, true, true, true, true, true],
  "9": [true, true, true, true, false, true, true],
  " ": [false, false, false, false, false, false, false],
};

export function LcdSevenDigit({
  ch,
  x,
  y,
  w,
  h,
  color,
}: {
  ch: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}) {
  const s = SEG[ch] ?? SEG[" "];
  const sw = 2.4;
  const g = 2;
  const hw = w - g * 2;
  const hh = (h - g * 3) / 2;

  const lines: [boolean, number, number, number, number][] = [
    [s[0], g, g, g + hw, g],
    [s[1], g, g, g, g + hh],
    [s[2], g + hw, g, g + hw, g + hh],
    [s[3], g, g + hh, g + hw, g + hh],
    [s[4], g, g + hh + g, g, g + hh + g + hh],
    [s[5], g + hw, g + hh + g, g + hw, g + hh + g + hh],
    [s[6], g, g + hh + g + hh, g + hw, g + hh + g + hh],
  ];

  return (
    <g transform={`translate(${x}, ${y})`}>
      {lines.map(([on, x1, y1, x2, y2], i) =>
        on ? (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="butt"
          />
        ) : null,
      )}
    </g>
  );
}
