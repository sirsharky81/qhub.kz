"use client";

import { useEffect, useRef, useState } from "react";

const KEYBOARD_THRESHOLD_PX = 80;

/**
 * Syncs the visual viewport height to a CSS custom property
 * (--messenger-vvh) and exposes a keyboardOpen boolean.
 *
 * Why CSS custom property instead of React state for the height?
 * ─────────────────────────────────────────────────────────────
 * React state → RAF → setState → reconcile → paint = ~2-3 frames lag.
 * style.setProperty() inside the event handler = 0-frame lag: the browser
 * picks it up in the very next paint that is already being scheduled by
 * visualViewport.resize.  This means the shell shrinks in lock-step with
 * the keyboard animation so iOS never needs to pan the web view to reveal
 * the focused textarea — which is what was causing the header to jump off
 * the top of the screen.
 *
 * dvh (CSS) is equally fast when it works, but it is unreliable in
 * iOS PWA standalone mode (reports a constant value instead of updating
 * with the keyboard).  The CSS-var approach works everywhere.
 */
export function useViewportState(enabled: boolean): { keyboardOpen: boolean } {
  const baseRef = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    baseRef.current = Math.round(vv.height);

    let raf = 0;
    const sync = () => {
      // ── Synchronous: update CSS var in the same microtask as the event ──
      // The browser picks this up before deciding whether to pan the web view.
      root.style.setProperty("--messenger-vvh", `${Math.round(vv.height)}px`);

      // ── Async: keyboardOpen only drives the 34px safe-area toggle ──
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(vv.height);
        const base = baseRef.current || h;
        setKeyboardOpen(base - h > KEYBOARD_THRESHOLD_PX);
      });
    };

    sync(); // set the initial value immediately
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--messenger-vvh");
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
