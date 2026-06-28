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

    // #region agent log
    fetch('http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9851b9'},body:JSON.stringify({sessionId:'9851b9',location:'use-visual-viewport.ts:mount',message:'MOUNT values',data:{vvHeight:Math.round(vv.height),vvOffsetTop:Math.round(vv.offsetTop),windowInnerHeight:window.innerHeight,windowInnerWidth:window.innerWidth,baseRef:baseRef.current,screenHeight:window.screen?.height},timestamp:Date.now(),hypothesisId:'A-B-C-D-E'})}).catch(()=>{});
    // #endregion

    let raf = 0;
    let syncCount = 0;
    const sync = () => {
      const h = Math.round(vv.height);
      const off = Math.round(vv.offsetTop);
      syncCount++;

      // ── Synchronous: update CSS var in the same microtask as the event ──
      root.style.setProperty("--messenger-vvh", `${h}px`);

      // #region agent log
      fetch('http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9851b9'},body:JSON.stringify({sessionId:'9851b9',location:'use-visual-viewport.ts:sync',message:'sync fired',data:{syncCount,vvHeight:h,vvOffsetTop:off,vvWidth:Math.round(vv.width),vvScale:vv.scale,windowInnerHeight:window.innerHeight,cssVarSet:`${h}px`,base:baseRef.current},timestamp:Date.now(),hypothesisId:'A-B-C-D'})}).catch(()=>{});
      // #endregion

      // ── Async: keyboardOpen only drives the 34px safe-area toggle ──
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const base = baseRef.current || h;
        const isOpen = base - h > KEYBOARD_THRESHOLD_PX;
        setKeyboardOpen(isOpen);

        // #region agent log
        fetch('http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9851b9'},body:JSON.stringify({sessionId:'9851b9',location:'use-visual-viewport.ts:raf',message:'RAF keyboardOpen',data:{base,currentH:h,diff:base-h,keyboardOpen:isOpen,vvOffsetTop:Math.round(vv.offsetTop)},timestamp:Date.now(),hypothesisId:'D-E'})}).catch(()=>{});
        // #endregion
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
