"use client";

import { useEffect, useRef } from "react";

interface NeedleProps {
  cents: number;
  confidence: number;
  displayState: "listening" | "uncertain" | "stable";
}

const MAX_CENTS = 50;

export default function Needle({ cents, confidence, displayState }: NeedleProps) {
  const needleRef = useRef<HTMLDivElement>(null);
  const displayedCentsRef = useRef(0);
  const targetCentsRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    targetCentsRef.current = Math.max(-MAX_CENTS, Math.min(MAX_CENTS, cents));
  }, [cents]);

  useEffect(() => {
    const animate = () => {
      const current = displayedCentsRef.current;
      const target = targetCentsRef.current;
      const diff = target - current;
      displayedCentsRef.current = current + diff * 0.25;

      const angle = (displayedCentsRef.current / MAX_CENTS) * 45;
      if (needleRef.current) {
        needleRef.current.style.transform = `rotate(${angle}deg)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const opacity =
    displayState === "listening" ? 0.4 : displayState === "uncertain" ? 0.65 : 1;

  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-gray-200 dark:text-gray-700"
        />
        <path
          d="M 30 100 A 70 70 0 0 1 170 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-emerald-500/30"
        />
        <line x1="40" y1="100" x2="160" y2="100" stroke="currentColor" strokeWidth="1" className="text-gray-300 dark:text-gray-600" />
        {[-40, -20, 0, 20, 40].map((tick) => {
          const rad = ((tick / MAX_CENTS) * 45 * Math.PI) / 180;
          const x1 = 100 + 75 * Math.sin(rad);
          const y1 = 100 - 75 * Math.cos(rad);
          const x2 = 100 + 85 * Math.sin(rad);
          const y2 = 100 - 85 * Math.cos(rad);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={tick === 0 ? 2 : 1}
              className="text-gray-400 dark:text-gray-500"
            />
          );
        })}
      </svg>
      <div
        ref={needleRef}
        className="absolute left-1/2 top-1/2 h-[42%] w-1 origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-emerald-500 shadow-sm transition-opacity"
        style={{ opacity: opacity * (0.5 + confidence / 200) }}
      />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600" />
    </div>
  );
}
