"use client";

import { useEffect, useState } from "react";

const KEYBOARD_THRESHOLD_PX = 80;

function readKeyboardHeight(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  // window.innerHeight is CONSTANT on iOS (layout viewport never resizes).
  // vv.height shrinks when the keyboard opens (default "resizes-visual" behaviour).
  // vv.offsetTop is usually 0 when body overflow is hidden; we still subtract it
  // so that any brief auto-scroll during animation doesn't corrupt the value.
  const raw = window.innerHeight - vv.height - vv.offsetTop;
  return raw > KEYBOARD_THRESHOLD_PX ? Math.round(raw) : 0;
}

/**
 * Height (px) that the virtual keyboard currently covers from the bottom of the
 * screen.  Returns 0 when no keyboard is visible.
 * Works on iOS PWA, Android Chrome, and desktop browsers.
 */
export function useKeyboardHeight(enabled: boolean): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setHeight(readKeyboardHeight()));
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

  return height;
}

export function scrollChatListToBottom(listEl: HTMLElement | null): void {
  if (!listEl) return;
  requestAnimationFrame(() => {
    listEl.scrollTop = listEl.scrollHeight;
  });
}

export function isChatListNearBottom(
  listEl: HTMLElement | null,
  thresholdPx = 120,
): boolean {
  if (!listEl) return true;
  return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight <= thresholdPx;
}
