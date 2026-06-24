"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const SWIPE_THRESHOLD = 48;
const SWIPE_MAX = 80;
const AXIS_DECIDE_PX = 10;

/** WhatsApp-style swipe right to reply (left → right). */
export function useSwipeToReply(
  targetRef: RefObject<HTMLElement | null>,
  onReply?: () => void,
  enabled = false,
) {
  const [offset, setOffset] = useState(0);
  const [settling, setSettling] = useState(false);
  const offsetRef = useRef(0);
  const touchRef = useRef({ x: 0, y: 0, active: false, axis: null as "h" | "v" | null });

  const reset = useCallback(() => {
    setSettling(true);
    offsetRef.current = 0;
    setOffset(0);
    window.setTimeout(() => setSettling(false), 180);
  }, []);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled || !onReply) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = { x: t.clientX, y: t.clientY, active: true, axis: null };
      setSettling(false);
    };

    const onMove = (e: TouchEvent) => {
      const state = touchRef.current;
      if (!state.active) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - state.x;
      const dy = t.clientY - state.y;

      if (state.axis === null) {
        if (Math.abs(dx) < AXIS_DECIDE_PX && Math.abs(dy) < AXIS_DECIDE_PX) return;
        state.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }

      if (state.axis === "v") return;

      if (dx > 0) {
        const next = Math.min(dx, SWIPE_MAX);
        offsetRef.current = next;
        setOffset(next);
        if (next > AXIS_DECIDE_PX) e.preventDefault();
      } else {
        offsetRef.current = 0;
        setOffset(0);
      }
    };

    const onEnd = () => {
      const state = touchRef.current;
      if (!state.active) return;
      state.active = false;
      state.axis = null;

      if (offsetRef.current >= SWIPE_THRESHOLD) {
        onReply();
        navigator.vibrate?.(12);
      }
      reset();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, onReply, reset, targetRef]);

  const progress = Math.min(1, offset / SWIPE_THRESHOLD);

  return {
    offset,
    progress,
    style: {
      transform: offset > 0 ? `translateX(${offset}px)` : undefined,
      transition: settling ? "transform 0.18s ease-out" : "none",
    } as const,
  };
}
