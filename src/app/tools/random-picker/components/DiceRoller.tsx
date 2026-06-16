"use client";

import { useCallback, useState } from "react";
import { getSecureRandomInt } from "@/lib/random-picker";
import { PickerButton, PickerSection } from "./PickerButton";

const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const dots = DOTS[value] ?? DOTS[1]!;
  return (
    <div
      className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white dark:bg-gray-100 shadow-[0_4px_0_#cbd5e1,0_8px_16px_rgba(0,0,0,0.12)] border border-gray-200 transition-transform duration-300 ${
        rolling ? "animate-dice-shake" : ""
      }`}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="w-full h-full p-3">
        <rect x="4" y="4" width="92" height="92" rx="14" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="7" fill="#0f172a" />
        ))}
      </svg>
    </div>
  );
}

export function DiceRoller() {
  const [diceCount, setDiceCount] = useState<1 | 2>(1);
  const [values, setValues] = useState<[number, number]>([1, 1]);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<{ values: number[]; total: number }[]>([]);

  const roll = useCallback(() => {
    if (rolling) return;
    setRolling(true);

    const duration = 600 + getSecureRandomInt(0, 400);
    const interval = setInterval(() => {
      setValues([
        getSecureRandomInt(1, 6),
        diceCount === 2 ? getSecureRandomInt(1, 6) : values[1],
      ]);
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      const v1 = getSecureRandomInt(1, 6);
      const v2 = diceCount === 2 ? getSecureRandomInt(1, 6) : 0;
      const final = diceCount === 2 ? [v1, v2] : [v1];
      setValues([v1, v2 || 1]);
      setHistory((h) => [{ values: final, total: final.reduce((a, b) => a + b, 0) }, ...h].slice(0, 20));
      setRolling(false);
    }, duration);
  }, [diceCount, rolling, values]);

  const total = diceCount === 2 ? values[0] + values[1] : values[0];

  return (
    <PickerSection title="Бросок кубиков" hint="Замена физических кубиков для настольных игр">
      <div className="flex gap-2">
        {([1, 2] as const).map((n) => (
          <PickerButton
            key={n}
            variant={diceCount === n ? "primary" : "secondary"}
            onClick={() => setDiceCount(n)}
            disabled={rolling}
          >
            {n === 1 ? "1 кубик" : "2 кубика"}
          </PickerButton>
        ))}
      </div>

      <div
        className="flex items-center justify-center gap-6 py-8"
        aria-live="polite"
        aria-atomic="true"
      >
        <DieFace value={values[0]} rolling={rolling} />
        {diceCount === 2 && <DieFace value={values[1]} rolling={rolling} />}
      </div>

      <div className="text-center">
        <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">{total}</p>
        <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-wide">Сумма</p>
      </div>

      <PickerButton onClick={roll} disabled={rolling} className="w-full">
        {rolling ? "Бросаем…" : "Начать игру"}
      </PickerButton>

      {history.length > 0 && (
        <ul className="space-y-1 pt-2 border-t border-gray-100 dark:border-gray-800">
          {history.map((h, i) => (
            <li key={i} className="text-xs text-gray-500 flex justify-between font-mono">
              <span>{h.values.join(" + ")}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">= {h.total}</span>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        @keyframes dice-shake {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-8deg) translateY(-4px); }
          50% { transform: rotate(6deg) translateY(2px); }
          75% { transform: rotate(-4deg) translateY(-2px); }
        }
        .animate-dice-shake {
          animation: dice-shake 0.15s ease-in-out infinite;
        }
      `}</style>
    </PickerSection>
  );
}
