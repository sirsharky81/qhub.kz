"use client";

import { useEffect, useState } from "react";
import { SpiderCard } from "./SpiderCard";
import type { PlayingCard } from "@/lib/games/cards/types";

export interface SpiderFlyItem {
  id: string;
  card: PlayingCard;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number; w: number; h: number };
  delayMs?: number;
  durationMs?: number;
  hidden?: boolean;
}

export function SpiderAnimationLayer({ items }: { items: SpiderFlyItem[] }) {
  const [active, setActive] = useState<SpiderFlyItem[]>([]);

  useEffect(() => {
    if (items.length === 0) return;
    setActive(items);
    const maxDuration = Math.max(...items.map((item) => (item.delayMs ?? 0) + (item.durationMs ?? 320)));
    const timer = window.setTimeout(() => setActive([]), maxDuration + 40);
    return () => window.clearTimeout(timer);
  }, [items]);

  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {active.map((item) => (
        <FlyingCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function FlyingCard({ item }: { item: SpiderFlyItem }) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const delay = item.delayMs ?? 0;
    const timer = window.setTimeout(() => setStarted(true), delay);
    return () => window.clearTimeout(timer);
  }, [item.delayMs]);

  const duration = item.durationMs ?? 320;
  const dx = item.to.x - item.from.x;
  const dy = item.to.y - item.from.y;
  const scaleX = item.to.w / item.from.w;
  const scaleY = item.to.h / item.from.h;

  return (
    <div
      className="absolute will-change-transform"
      style={{
        left: item.from.x,
        top: item.from.y,
        width: item.from.w,
        height: item.from.h,
        transform: started
          ? `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`
          : "translate(0, 0) scale(1, 1)",
        transition: `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        zIndex: 50,
      }}
    >
      <SpiderCard card={item.card} hidden={item.hidden} fill className="w-full h-full" />
    </div>
  );
}

export function rectToFlyBox(rect: DOMRect) {
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}
