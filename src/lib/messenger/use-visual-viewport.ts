"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface ViewportLayout {
  height: number;
  top: number;
  width: number;
  left: number;
}

export function useVisualViewportShell(enabled: boolean): {
  style: CSSProperties;
  active: boolean;
} {
  const [layout, setLayout] = useState<ViewportLayout | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setLayout({
        height: vv.height,
        top: vv.offsetTop,
        width: vv.width,
        left: vv.offsetLeft,
      });

      if (vv.offsetTop > 0 || window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
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
  const run = () => {
    listEl.scrollTop = listEl.scrollHeight;
  };
  run();
  requestAnimationFrame(run);
}
