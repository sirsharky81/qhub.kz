"use client";

import { useEffect, useState } from "react";

const KEYBOARD_OPEN_THRESHOLD_PX = 8;

function readKeyboardOverlap(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const overlap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  return overlap > KEYBOARD_OPEN_THRESHOLD_PX ? overlap : 0;
}

/** Space to lift fixed UI above the virtual keyboard (iOS PWA). */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setInset(readKeyboardOverlap());
      });
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [enabled]);

  return inset;
}

export function scrollChatListToBottom(listEl: HTMLElement | null): void {
  if (!listEl) return;
  requestAnimationFrame(() => {
    listEl.scrollTop = listEl.scrollHeight;
  });
}

export function isChatListNearBottom(listEl: HTMLElement | null, thresholdPx = 120): boolean {
  if (!listEl) return true;
  return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight <= thresholdPx;
}
