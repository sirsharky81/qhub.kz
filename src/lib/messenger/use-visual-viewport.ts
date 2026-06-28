"use client";

import { useEffect, useRef, useState } from "react";

export interface ViewportState {
  /**
   * Visual viewport height in CSS pixels.
   * Shrinks when the virtual keyboard is open.
   * 0 before the first client-side render.
   */
  vvHeight: number;
  /**
   * Distance between the top of the visual viewport and the top of the layout
   * viewport, in CSS pixels.  Positive when iOS auto-scrolls the page up to
   * keep the focused input visible after the keyboard opens.
   * We compensate with translateY(vvOffsetTop) so that the shell always tracks
   * the visual viewport exactly.
   */
  vvOffsetTop: number;
  /** True while the virtual keyboard is significantly covering the screen. */
  keyboardOpen: boolean;
}

const KEYBOARD_THRESHOLD_PX = 80;

/**
 * Tracks the visual viewport precisely, including the scroll offset that iOS
 * adds when the keyboard pushes content around.
 *
 * Design:
 * - Captures vv.height at mount (no keyboard) as the baseline.
 * - On every visualViewport resize/scroll event (batched via rAF) it reads
 *   vv.height and vv.offsetTop.
 * - keyboardOpen  = baseline - vv.height > threshold
 * - Callers should size their shell to `height: vvHeight` and offset it with
 *   `transform: translateY(vvOffsetTop)` so the shell always fills exactly
 *   the visible region above the keyboard.
 */
export function useViewportState(enabled: boolean): ViewportState {
  const baseRef = useRef(0);
  const [state, setState] = useState<ViewportState>({
    vvHeight: 0,
    vvOffsetTop: 0,
    keyboardOpen: false,
  });

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
        const ot = Math.round(vv.offsetTop);
        const base = baseRef.current || h;
        setState({
          vvHeight: h,
          vvOffsetTop: ot,
          keyboardOpen: base - h > KEYBOARD_THRESHOLD_PX,
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
