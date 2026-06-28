"use client";

import { useEffect, useRef, useState } from "react";

export interface ViewportState {
  /**
   * True while the virtual keyboard is open.
   * Computed by comparing current vv.height to the height captured at mount
   * (before the keyboard appeared).
   */
  keyboardOpen: boolean;
}

const KEYBOARD_THRESHOLD_PX = 80;

/**
 * Detects whether the virtual keyboard is currently open.
 *
 * We deliberately do NOT expose vv.height or vv.offsetTop for shell sizing:
 * those values have a ~1 rAF frame lag which causes visual jumps.  Instead,
 * the shell uses CSS `height: 100dvh` (dynamic viewport height), which the
 * browser updates synchronously as the keyboard animates.
 *
 * The only thing we need from JS is the boolean keyboardOpen so that
 * ChatComposer can toggle its safe-area-inset-bottom padding:
 *   - keyboard closed → add env(safe-area-inset-bottom) to lift above home bar
 *   - keyboard open   → remove it (home bar is behind the keyboard, no gap needed)
 */
export function useViewportState(enabled: boolean): ViewportState {
  const baseRef = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture the no-keyboard height once at mount.
    baseRef.current = Math.round(vv.height);

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(vv.height);
        const base = baseRef.current || h;
        setKeyboardOpen(base - h > KEYBOARD_THRESHOLD_PX);
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

  return { keyboardOpen };
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
