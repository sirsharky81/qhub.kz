"use client";

import { useEffect, useMemo, useState } from "react";
import type { AutoslalomState } from "@/lib/games/autoslalom/types";
import {
  allBarrierSlots,
  allCarSlots,
  FLAG_BR,
  FLAG_TOP,
  LCD_COLORS,
  LCD_VIEW,
  LIFE_SLOTS,
  MODE_BADGE,
  RED_TRACK_LINES,
  SCORE_DIGITS,
} from "@/lib/games/autoslalom/lcd-layout";
import { buildActiveSegmentIds, clockDigitChars, scoreDigitChars } from "@/lib/games/autoslalom/lcd-segments";
import { LcdSevenDigit } from "./lcd/LcdSevenDigit";
import { LcdCarSprite, LcdCheckeredFlag, LcdLifeSprite } from "./lcd/LcdSprites";

interface LcdSvgDisplayProps {
  state: AutoslalomState;
  highScore: number;
  alarmRinging: boolean;
  now: Date;
}

const BARRIER_SLOTS = allBarrierSlots();
const CAR_SLOTS = allCarSlots();

function MaskFlag({ x, y, size }: { x: number; y: number; size: number }) {
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
          fill={(r + c) % 2 ? "white" : "black"}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}

export function LcdSvgDisplay({ state, highScore, alarmRinging, now }: LcdSvgDisplayProps) {
  const [frame, setFrame] = useState(0);
  const animating =
    state.phase === "playing" || state.phase === "crash" || alarmRinging;

  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    const loop = () => {
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  void frame;

  const blink = state.phase === "crash" && Math.floor(Date.now() / 120) % 2 === 0;
  const active = useMemo(() => buildActiveSegmentIds(state, blink), [state, blink, frame]);

  const bg = alarmRinging && Math.floor(Date.now() / 500) % 2 ? LCD_COLORS.bgDark : LCD_COLORS.bg;
  const seg = LCD_COLORS.segment;
  const isClock = state.phase === "clock";
  const digits = isClock ? clockDigitChars(state, now) : scoreDigitChars(state, highScore);

  return (
    <svg
      viewBox={`0 0 ${LCD_VIEW.w} ${LCD_VIEW.h}`}
      className="block w-full h-full touch-none"
      aria-label="ЖК-экран Автослалом"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="autoslalom-lcd-mask">
          <rect width={LCD_VIEW.w} height={LCD_VIEW.h} fill="black" />
          <g fill="white" stroke="white">
            {BARRIER_SLOTS.map((slot) =>
              active.has(slot.id) ? (
                <rect
                  key={slot.id}
                  x={-slot.w / 2}
                  y={-slot.h / 2}
                  width={slot.w}
                  height={slot.h}
                  transform={`translate(${slot.x} ${slot.y}) rotate(${slot.angle})`}
                />
              ) : null,
            )}
            {CAR_SLOTS.map((slot) =>
              active.has(slot.id) ? (
                <g key={slot.id} transform={`translate(${slot.x} ${slot.y}) rotate(${slot.angle}) scale(${slot.scale})`}>
                  <LcdCarSprite color="white" />
                </g>
              ) : null,
            )}
            {LIFE_SLOTS.map((slot, i) =>
              active.has(`life-${i}`) ? (
                <g key={`life-${i}`} transform={`translate(${slot.x} ${slot.y})`}>
                  <LcdLifeSprite color="white" />
                </g>
              ) : null,
            )}
            {active.has(`mode-${state.mode}`) && (
              <text
                x={MODE_BADGE.x + MODE_BADGE.size / 2}
                y={MODE_BADGE.y + MODE_BADGE.size / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="13"
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
                fill="white"
              >
                {state.mode}
              </text>
            )}
            <MaskFlag x={FLAG_TOP.x} y={FLAG_TOP.y} size={FLAG_TOP.size} />
            <MaskFlag x={FLAG_BR.x} y={FLAG_BR.y} size={FLAG_BR.size} />
          </g>
        </mask>
      </defs>

      <rect width={LCD_VIEW.w} height={LCD_VIEW.h} fill={bg} />

      {/* Едва заметный контур вытравленных, но выключенных LCD-сегментов. */}
      <g fill={seg} opacity="0.045">
        {BARRIER_SLOTS.map((slot) => (
          <rect
            key={`ghost-${slot.id}`}
            x={-slot.w / 2}
            y={-slot.h / 2}
            width={slot.w}
            height={slot.h}
            transform={`translate(${slot.x} ${slot.y}) rotate(${slot.angle})`}
          />
        ))}
      </g>

      <g>
        {RED_TRACK_LINES.map((line, i) => (
          <g key={i}>
            <line
              {...line}
              transform={i < 2 ? "translate(0 3)" : "translate(-3 0)"}
              stroke={seg}
              strokeOpacity="0.58"
              strokeWidth="4.8"
              strokeLinecap="square"
            />
            <line
              {...line}
              stroke={LCD_COLORS.track}
              strokeWidth="3.2"
              strokeLinecap="square"
            />
          </g>
        ))}
        <text transform="translate(119 92) rotate(-28)" fill={seg} fontFamily="Arial Narrow, Arial, sans-serif" fontSize="11" fontWeight="bold">РАЛЛИ</text>
        <text transform="translate(171 64) rotate(-28)" fill={seg} fontFamily="Arial Narrow, Arial, sans-serif" fontSize="11" fontWeight="bold">РАЛЛИ</text>
        <text transform="translate(221 37) rotate(-28)" fill={seg} fontFamily="Arial Narrow, Arial, sans-serif" fontSize="11" fontWeight="bold">РАЛЛИ</text>
        <text transform="translate(27 149) rotate(-65)" fill={seg} fontFamily="Arial, sans-serif" fontSize="9" fontWeight="bold">РАЛЛИ</text>
        <text transform="translate(17 179) rotate(-65)" fill={seg} fontFamily="Arial, sans-serif" fontSize="9" fontWeight="bold">РАЛЛИ</text>
        <rect x={MODE_BADGE.x} y={MODE_BADGE.y} width={MODE_BADGE.size} height={MODE_BADGE.size} fill="none" stroke={seg} strokeWidth="1.5" />
      </g>

      <g>
        {digits.map((ch, i) => (
          <LcdSevenDigit key={i} ch={ch} {...SCORE_DIGITS[i]} color={seg} />
        ))}
      </g>

      {isClock && state.clock.alarmEnabled && (
        <g transform="translate(168 8)">
          <LcdCheckeredFlag x={0} y={0} size={14} />
        </g>
      )}

      <rect width={LCD_VIEW.w} height={LCD_VIEW.h} fill={seg} mask="url(#autoslalom-lcd-mask)" />

      {LIFE_SLOTS.map((slot, i) =>
        i >= state.lives && i < state.maxLives ? (
          <g key={`life-outline-${i}`} transform={`translate(${slot.x} ${slot.y})`}>
            <LcdLifeSprite color={seg} outline />
          </g>
        ) : null,
      )}
    </svg>
  );
}
