"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSecureRandomInt, getSecureRandomFloat, pickRandomOne } from "@/lib/random-picker";
import { playTickSound, playWinSound } from "./NumberGenerator";

interface WheelPickerProps {
  participants: string[];
  soundEnabled: boolean;
  onResult: (winner: string) => void;
  disabled?: boolean;
}

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
];

export function WheelPicker({ participants, soundEnabled, onResult, disabled }: WheelPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const rotationRef = useRef(0);
  const animRef = useRef<number>(0);

  const drawWheel = useCallback(
    (rotation: number, highlightIndex?: number) => {
      const canvas = canvasRef.current;
      if (!canvas || participants.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const size = canvas.width;
      const cx = size / 2;
      const cy = size / 2;
      const radius = size / 2 - 8;
      const sliceAngle = (2 * Math.PI) / participants.length;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      participants.forEach((name, i) => {
        const start = i * sliceAngle;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, start + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length]!;
        ctx.fill();
        if (highlightIndex === i) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        ctx.save();
        ctx.rotate(start + sliceAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(10, Math.min(14, 180 / participants.length))}px system-ui`;
        const label = name.length > 12 ? `${name.slice(0, 11)}…` : name;
        ctx.fillText(label, radius - 12, 4);
        ctx.restore();
      });

      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
      ctx.fillStyle = "#0f172a";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, 4);
      ctx.lineTo(cx - 12, 28);
      ctx.lineTo(cx + 12, 28);
      ctx.closePath();
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    },
    [participants],
  );

  useEffect(() => {
    drawWheel(rotationRef.current);
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (spinning || disabled || participants.length === 0) return;

    const winner = pickRandomOne(participants);
    const winnerIndex = participants.indexOf(winner);
    const sliceAngle = (2 * Math.PI) / participants.length;
    const targetAngle =
      -winnerIndex * sliceAngle - sliceAngle / 2 - Math.PI / 2;
    const extraSpins = getSecureRandomInt(4, 8) * 2 * Math.PI;
    const duration = getSecureRandomInt(3000, 6000);
    const startRotation = rotationRef.current;
    const startTime = performance.now();
    const totalRotation = extraSpins + targetAngle - (startRotation % (2 * Math.PI));

    setSpinning(true);
    let lastTick = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      rotationRef.current = startRotation + totalRotation * eased;
      drawWheel(rotationRef.current);

      if (soundEnabled && t < 0.95) {
        const tickInterval = 80 + t * 200;
        if (now - lastTick > tickInterval) {
          playTickSound();
          lastTick = now;
        }
      }

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        drawWheel(rotationRef.current, winnerIndex);
        if (soundEnabled) playWinSound();
        onResult(winner);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [spinning, disabled, participants, soundEnabled, drawWheel, onResult]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="max-w-full rounded-full shadow-lg"
        aria-label="Колесо выбора"
      />
      <button
        type="button"
        onClick={spin}
        disabled={spinning || disabled || participants.length === 0}
        className="rounded-xl bg-gray-900 dark:bg-blue-600 text-white px-8 py-3 font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {spinning ? "Вращение…" : "Крутить колесо"}
      </button>
    </div>
  );
}
