"use client";

import { useEffect, useState } from "react";

export interface VisualViewportFrame {
  top: number;
  height: number;
  keyboardOpen: boolean;
}

const KEYBOARD_OPEN_DELTA_PX = 80;

function readVisualViewportFrame(): VisualViewportFrame {
  if (typeof window === "undefined") {
    return { top: 0, height: 0, keyboardOpen: false };
  }
  const vv = window.visualViewport;
  const height = Math.round(vv?.height ?? window.innerHeight);
  const top = Math.max(0, Math.round(vv?.offsetTop ?? 0));
  return {
    top,
    height,
    keyboardOpen: height < window.innerHeight - KEYBOARD_OPEN_DELTA_PX,
  };
}

/** Pin full-screen chat UI to the visible viewport (iOS keyboard / PWA). */
export function useVisualViewportFrame(enabled: boolean): VisualViewportFrame {
  const [frame, setFrame] = useState(readVisualViewportFrame);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setFrame(readVisualViewportFrame());
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

  return frame;
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
