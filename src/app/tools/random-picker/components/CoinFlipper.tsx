"use client";

import { useCallback, useRef, useState } from "react";
import { getSecureRandomInt } from "@/lib/random-picker";
import { playTickSound, playWinSound } from "./NumberGenerator";
import { PickerButton, PickerSection } from "./PickerButton";

type CoinSide = "heads" | "tails";

const SIDE_LABEL: Record<CoinSide, string> = {
  heads: "Орёл",
  tails: "Решка",
};

function CoinFace({ side }: { side: "front" | "back" }) {
  const isHeads = side === "front";
  return (
    <div
      className={`coin-face absolute inset-0 rounded-full border-[3px] flex flex-col items-center justify-center overflow-hidden ${
        isHeads
          ? "coin-face-heads border-amber-600/80"
          : "coin-face-tails border-amber-700/60"
      }`}
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
    >
      {isHeads ? (
        <>
          <svg viewBox="0 0 100 100" className="w-[58%] h-[58%] text-amber-900/90" aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
            <path
              d="M50 18 C38 22 30 32 28 44 C26 56 30 68 38 76 C44 82 50 84 50 84 C50 84 56 82 62 76 C70 68 74 56 72 44 C70 32 62 22 50 18 Z"
              fill="currentColor"
              opacity="0.85"
            />
            <path
              d="M50 28 L54 40 L66 40 L56 48 L60 60 L50 52 L40 60 L44 48 L34 40 L46 40 Z"
              fill="#fef3c7"
              opacity="0.9"
            />
          </svg>
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-amber-950/80 mt-1 uppercase">
            Орёл
          </span>
        </>
      ) : (
        <>
          <span className="text-3xl sm:text-4xl font-black text-amber-950/75 tabular-nums leading-none">1</span>
          <span className="text-[9px] sm:text-[10px] font-semibold tracking-[0.25em] text-amber-900/60 mt-1 uppercase">
            Тенге
          </span>
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-amber-950/80 mt-0.5 uppercase">
            Решка
          </span>
        </>
      )}
    </div>
  );
}

export function CoinFlipper() {
  const [side, setSide] = useState<CoinSide>("heads");
  const [rotation, setRotation] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<{ side: CoinSide; time: string }[]>([]);
  const flipToken = useRef(0);

  const flip = useCallback(() => {
    if (flipping) return;
    const token = ++flipToken.current;
    const isHeads = getSecureRandomInt(0, 1) === 0;
    const nextSide: CoinSide = isHeads ? "heads" : "tails";
    const spins = 5 + getSecureRandomInt(0, 4);
    const landing = isHeads ? 0 : 180;
    const base = Math.ceil(rotation / 360) * 360;
    const nextRotation = base + spins * 360 + landing;

    setFlipping(true);
    setShowResult(false);
    playTickSound();
    setRotation(nextRotation);

    window.setTimeout(() => {
      if (flipToken.current !== token) return;
      setSide(nextSide);
      setFlipping(false);
      setShowResult(true);
      playWinSound();
      const now = new Date();
      const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setHistory((h) => [{ side: nextSide, time }, ...h].slice(0, 20));
    }, 1300);
  }, [flipping, rotation]);

  return (
    <PickerSection title="Бросить монетку" hint="Выпадение орла или решки">
      <div className="relative flex flex-col items-center py-4 sm:py-6" aria-live="polite" aria-atomic="true">
        <div
          className={`coin-shadow absolute bottom-[18%] w-24 sm:w-28 h-4 rounded-[50%] bg-black/20 blur-md transition-all duration-300 ${
            flipping ? "coin-shadow-flip scale-75 opacity-40" : "scale-100 opacity-60"
          }`}
          aria-hidden
        />

        <div className={`coin-stage ${flipping ? "coin-stage-flip" : ""}`}>
          <div
            className="coin-3d relative w-28 h-28 sm:w-32 sm:h-32"
            style={{
              transform: `rotateY(${rotation}deg)`,
              transition: flipping
                ? "transform 1.25s cubic-bezier(0.15, 0.85, 0.25, 1)"
                : "transform 0.4s ease-out",
            }}
          >
            <div className="absolute inset-0" style={{ transform: "rotateY(0deg)", backfaceVisibility: "hidden" }}>
              <CoinFace side="front" />
            </div>
            <div className="absolute inset-0" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
              <CoinFace side="back" />
            </div>
          </div>
        </div>

        <div
          className={`mt-8 text-center transition-all duration-500 ${
            showResult && !flipping ? "opacity-100 translate-y-0" : "opacity-70 translate-y-1"
          }`}
        >
          <p
            className={`text-3xl sm:text-4xl font-bold tracking-tight ${
              side === "heads"
                ? "text-amber-700 dark:text-amber-400"
                : "text-slate-700 dark:text-slate-300"
            } ${showResult && !flipping ? "animate-result-pop" : ""}`}
          >
            {flipping ? "…" : SIDE_LABEL[side]}
          </p>
          <p className="text-[11px] text-gray-500 mt-1.5 uppercase tracking-wide">
            {flipping ? "Монетка в воздухе" : "Результат"}
          </p>
        </div>
      </div>

      <PickerButton onClick={flip} disabled={flipping} className="w-full">
        {flipping ? "Бросаем…" : "Бросить монетку"}
      </PickerButton>

      {history.length > 0 && (
        <ul className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-800">
          {history.map((h, i) => (
            <li key={`${h.time}-${i}`} className="text-xs text-gray-500 flex justify-between items-center">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    h.side === "heads" ? "bg-amber-500" : "bg-slate-400"
                  }`}
                />
                <span className="font-medium text-gray-800 dark:text-gray-200">{SIDE_LABEL[h.side]}</span>
              </span>
              <span className="font-mono tabular-nums">{h.time}</span>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .coin-stage {
          perspective: 900px;
          transform-style: preserve-3d;
        }
        .coin-stage-flip {
          animation: coin-toss 1.25s cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
        }
        .coin-3d {
          transform-style: preserve-3d;
        }
        .coin-face {
          transform-style: preserve-3d;
        }
        .coin-face-heads {
          background: radial-gradient(circle at 35% 30%, #fff7d6 0%, #f5d565 35%, #d4a017 70%, #9a6b0a 100%);
          box-shadow:
            inset 0 2px 8px rgba(255, 255, 255, 0.55),
            inset 0 -3px 10px rgba(120, 70, 0, 0.35),
            0 6px 20px rgba(0, 0, 0, 0.18);
        }
        .coin-face-tails {
          background: radial-gradient(circle at 40% 35%, #f8fafc 0%, #e2e8f0 40%, #cbd5e1 75%, #94a3b8 100%);
          box-shadow:
            inset 0 2px 8px rgba(255, 255, 255, 0.7),
            inset 0 -3px 10px rgba(71, 85, 105, 0.25),
            0 6px 20px rgba(0, 0, 0, 0.15);
        }
        .coin-shadow-flip {
          animation: shadow-pulse 1.25s ease-in-out forwards;
        }
        @keyframes coin-toss {
          0% {
            transform: translateY(0) scale(1);
          }
          18% {
            transform: translateY(-6px) scale(1.02);
          }
          45% {
            transform: translateY(-72px) scale(1.06) rotateX(12deg);
          }
          72% {
            transform: translateY(-24px) scale(1.02) rotateX(-4deg);
          }
          100% {
            transform: translateY(0) scale(1) rotateX(0deg);
          }
        }
        @keyframes shadow-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.55;
          }
          45% {
            transform: scale(0.55);
            opacity: 0.25;
          }
        }
        @keyframes result-pop {
          0% {
            transform: scale(0.92);
            opacity: 0.5;
          }
          60% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-result-pop {
          animation: result-pop 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
        }
      `}</style>
    </PickerSection>
  );
}
