"use client";

import { useEffect, useRef, useState } from "react";

export interface ViewportState {
  /** Visual viewport height in CSS pixels. 0 before first client render. */
  vvHeight: number;
  /**
   * True while the virtual keyboard is open.
   * Detected by comparing current vv.height to the captured base height
   * at component mount (before the keyboard ever appeared).
   */
  keyboardOpen: boolean;
}

const KEYBOARD_THRESHOLD_PX = 80;

/**
 * Tracks the visual viewport height and keyboard state.
 *
 * Key design decisions:
 * - Uses vv.height at mount time as the "base" (no-keyboard reference)
 *   instead of window.innerHeight, which can vary across iOS versions and
 *   viewport configurations (viewport-fit=cover, PWA, etc.).
 * - Does NOT expose vv.offsetTop or use it for positioning — even with
 *   overflow:hidden on body, iOS can briefly make offsetTop non-zero during
 *   the keyboard animation, which would cause header jumps if used for top:.
 */
export function useViewportState(enabled: boolean): ViewportState {
  const baseRef = useRef(0);
  const [state, setState] = useState<ViewportState>({ vvHeight: 0, keyboardOpen: false });

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture the "no keyboard" height once, synchronously at mount.
    baseRef.current = Math.round(vv.height);

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(vv.height);
        const base = baseRef.current || h;
        const diff = base - h;
        setState({
          vvHeight: h,
          keyboardOpen: diff > KEYBOARD_THRESHOLD_PX,
        });
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

  return state;
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
