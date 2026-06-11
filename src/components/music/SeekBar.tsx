"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/music/types";

interface SeekBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  getLiveTime?: () => number;
  compact?: boolean;
  /** card — карточка; embedded — встроенный плеер в карточке */
  variant?: "default" | "card" | "embedded";
  /** Встроенный режим: перехват кликов для перемотки */
  interactive?: boolean;
  className?: string;
}

export function SeekBar({
  currentTime,
  duration,
  isPlaying,
  onSeek,
  getLiveTime,
  compact = false,
  variant = "default",
  interactive = false,
  className = "",
}: SeekBarProps) {
  const [displayTime, setDisplayTime] = useState(currentTime);
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isDragging) return;
    setDisplayTime(currentTime);
  }, [currentTime, isDragging]);

  useEffect(() => {
    if (!isPlaying || isDragging) return;

    const tick = () => {
      const live = getLiveTime?.() ?? currentTime;
      setDisplayTime(live);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isDragging, getLiveTime, currentTime]);

  const handleChange = useCallback(
    (value: number) => {
      setDisplayTime(value);
      onSeek(value);
    },
    [onSeek],
  );

  const max = duration > 0 ? duration : 1;
  const pct = Math.min(100, (displayTime / max) * 100);

  if (compact) {
    const isEmbedded = variant === "embedded";
    const isCard = variant === "card";
    const timeClass = isEmbedded
      ? "text-[9px] font-mono text-gray-400 tabular-nums w-7 shrink-0"
      : isCard
        ? "text-[10px] font-mono text-gray-400 tabular-nums w-8 shrink-0"
        : "text-[9px] font-mono text-gray-400 tabular-nums w-7 shrink-0";
    const trackH = isEmbedded ? "h-3.5" : isCard ? "h-5" : "h-3";
    const barH = isEmbedded ? "h-1" : isCard ? "h-1.5" : "h-1";
    const thumb = isEmbedded ? "w-2 h-2" : isCard ? "w-3 h-3" : "w-2.5 h-2.5";

    const interactiveClass = interactive ? "pointer-events-auto relative z-20" : "";

    return (
      <div
        className={`flex items-center gap-2 ${interactiveClass} ${className}`}
        onClick={interactive ? (e) => e.stopPropagation() : undefined}
        onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}
      >
        <span className={`${timeClass} text-right`}>{formatTime(displayTime)}</span>
        <div className={`relative flex-1 ${trackH} flex items-center group`}>
          <div
            className={`absolute inset-x-0 ${barH} rounded-full ${
              isEmbedded ? "bg-gray-200/90" : "bg-gray-200"
            }`}
          />
          <div
            className={`absolute left-0 ${barH} rounded-full transition-none ${
              isEmbedded ? "bg-gray-900" : "bg-violet-500"
            }`}
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={displayTime}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsDragging(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              setIsDragging(false);
            }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              handleChange(Number(e.target.value));
            }}
            className={`absolute inset-0 w-full ${isCard ? "h-5" : isEmbedded ? "h-3.5" : "h-full"} opacity-0 cursor-pointer touch-manipulation`}
            aria-label="Позиция воспроизведения"
          />
          <div
            className={`absolute ${thumb} rounded-full shadow-sm pointer-events-none ${
              isEmbedded
                ? "bg-gray-900 ring-2 ring-white"
                : "bg-violet-500"
            } ${isCard || isEmbedded ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
            style={{ left: `calc(${pct}% - ${isEmbedded ? 4 : isCard ? 6 : 5}px)` }}
          />
        </div>
        <span className={timeClass}>{formatTime(duration)}</span>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="relative h-5 flex items-center group">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-200" />
        <div
          className="absolute left-0 h-1.5 rounded-full bg-violet-500"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={0.1}
          value={displayTime}
          onPointerDown={(e) => {
            e.stopPropagation();
            setIsDragging(true);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setIsDragging(false);
          }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            handleChange(Number(e.target.value));
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          aria-label="Позиция воспроизведения"
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-gray-400 tabular-nums">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
