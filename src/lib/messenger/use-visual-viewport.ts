"use client";

import { useEffect, useState } from "react";

/** Space covered by the virtual keyboard from the bottom of the layout viewport. */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setInset(next);
      });
    };

    update();
    vv.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
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
