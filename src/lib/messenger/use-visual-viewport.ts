"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface ViewportLayout {
  height: number;
  top: number;
  width: number;
  left: number;
}

const KEYBOARD_HEIGHT_DELTA_PX = 80;

export function useVisualViewportShell(enabled: boolean): {
  style: CSSProperties;
  active: boolean;
} {
  const [layout, setLayout] = useState<ViewportLayout | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    let lastHeight = vv.height;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const height = vv.height;
        const keyboardOpening = lastHeight - height > KEYBOARD_HEIGHT_DELTA_PX;

        setLayout({
          height,
          top: vv.offsetTop,
          width: vv.width,
          left: vv.offsetLeft,
        });

        if (keyboardOpening && (vv.offsetTop > 0 || window.scrollY > 0)) {
          window.scrollTo(0, 0);
        }

        lastHeight = height;
      });
    };

    update();
    vv.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
    };
  }, [enabled]);

  if (!enabled || !layout) {
    return { style: {}, active: false };
  }

  return {
    active: true,
    style: {
      position: "fixed",
      top: layout.top,
      left: layout.left,
      width: layout.width,
      height: layout.height,
      maxHeight: layout.height,
    },
  };
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
