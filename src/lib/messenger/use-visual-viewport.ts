"use client";

import { useEffect, useState } from "react";

const KEYBOARD_OPEN_THRESHOLD_PX = 72;

function readKeyboardVisible(): boolean {
  if (typeof window === "undefined") return false;
  const vv = window.visualViewport;
  if (!vv) return false;
  return window.innerHeight - vv.height - vv.offsetTop > KEYBOARD_OPEN_THRESHOLD_PX;
}

/** True while the on-screen keyboard overlaps the layout viewport (iOS/Android). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => setVisible(readKeyboardVisible());

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return visible;
}

/** Pixels the chat shell extends below the visible viewport when the keyboard is open. */
export function useShellKeyboardGap(shellSelector = "[data-chat-shell]"): number {
  const keyboardVisible = useKeyboardVisible();
  const [gap, setGap] = useState(0);

  useEffect(() => {
    if (!keyboardVisible) {
      setGap(0);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      const shell = document.querySelector(shellSelector);
      if (!shell) {
        setGap(0);
        return;
      }
      const shellBottom = shell.getBoundingClientRect().bottom;
      const visibleBottom = vv.offsetTop + vv.height;
      const overflow = shellBottom - visibleBottom;
      setGap(overflow > 4 ? Math.round(overflow) : 0);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [keyboardVisible, shellSelector]);

  return gap;
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
