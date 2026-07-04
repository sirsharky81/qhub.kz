"use client";

import { useEffect, useRef, useState } from "react";

const KEYBOARD_THRESHOLD_PX = 80;

function syncViewportCssVars(): { keyboardOpen: boolean } {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) {
    return { keyboardOpen: false };
  }

  const h = Math.round(vv.height);
  const off = Math.max(0, Math.round(vv.offsetTop));
  const base = Number(root.dataset.messengerVvBase || h);
  const keyboardOpen = base - h > KEYBOARD_THRESHOLD_PX;

  // Pin the shell to the *visual* viewport, not the layout viewport.
  // iOS pans the layout viewport when the keyboard opens (offsetTop grows).
  // Without top=offsetTop, fixed top:0 content scrolls off-screen and only a
  // random slice (often the composer) remains visible at the top.
  const shellHeight = keyboardOpen ? h : window.innerHeight;
  // iOS occasionally reports a very large offsetTop while focusing textarea,
  // which can push the whole messenger shell down and make the composer appear
  // "floating" in the middle of screen. Clamp to a small safe range.
  const clampedOffsetTop = off > Math.round(h * 0.4) ? 0 : Math.min(off, 24);
  const shellTop = keyboardOpen ? clampedOffsetTop : 0;

  root.style.setProperty("--messenger-vvh", `${shellHeight}px`);
  root.style.setProperty("--messenger-vv-top", `${shellTop}px`);

  return { keyboardOpen };
}

/**
 * Keeps --messenger-vvh / --messenger-vv-top in sync with visualViewport.
 * Call once from MessengerShell (keyboard-aware chat layout).
 */
export function useViewportShellSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    root.dataset.messengerVvBase = String(Math.round(vv.height));

    const sync = () => {
      syncViewportCssVars();
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      delete root.dataset.messengerVvBase;
      root.style.removeProperty("--messenger-vvh");
      root.style.removeProperty("--messenger-vv-top");
    };
  }, [enabled]);
}

/** Keyboard visibility for composer safe-area padding. */
export function useKeyboardOpen(enabled: boolean): boolean {
  const baseRef = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

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

  return keyboardOpen;
}

/** @deprecated Use useViewportShellSync + useKeyboardOpen */
export function useViewportState(enabled: boolean): { keyboardOpen: boolean } {
  useViewportShellSync(enabled);
  const keyboardOpen = useKeyboardOpen(enabled);
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
