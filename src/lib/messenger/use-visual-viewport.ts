"use client";

import { useEffect, useState } from "react";

export interface ChatViewportLayout {
  top: number;
  height: number;
  keyboardOpen: boolean;
}

const KEYBOARD_OPEN_DELTA_PX = 80;

function readViewportLayout(): ChatViewportLayout {
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

/** Tracks the visible viewport on iOS — keeps header pinned when the keyboard opens. */
export function useChatViewportLayout(enabled: boolean): ChatViewportLayout {
  const [layout, setLayout] = useState<ChatViewportLayout>(readViewportLayout);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setLayout(readViewportLayout());
      });
    };

    update();
    vv.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
    };
  }, [enabled]);

  return layout;
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
