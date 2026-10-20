"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type SavedInlineStyle = {
  el: HTMLElement;
  prop: string;
  value: string;
  priority: string;
};

/** Pin html/body and track scroll on an inner pane (iOS PWA avoids dual scrollports). */
export function useIosSingleScrollPane(options?: { pinDocument?: boolean; scrollEndMs?: number }) {
  const pinDocument = options?.pinDocument ?? true;
  const scrollEndMs = options?.scrollEndMs ?? 180;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const onScrollEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!pinDocument) return;

    const html = document.documentElement;
    const body = document.body;
    const saved: SavedInlineStyle[] = [];
    const lock = (el: HTMLElement, prop: string, value: string) => {
      saved.push({
        el,
        prop,
        value: el.style.getPropertyValue(prop),
        priority: el.style.getPropertyPriority(prop),
      });
      el.style.setProperty(prop, value, "important");
    };

    for (const el of [html, body]) {
      lock(el, "position", "fixed");
      lock(el, "inset", "0");
      lock(el, "width", "100%");
      lock(el, "height", "100dvh");
      lock(el, "overflow", "hidden");
      lock(el, "overscroll-behavior", "none");
      lock(el, "touch-action", "pan-y");
    }

    return () => {
      for (const item of saved.reverse()) {
        if (item.value) item.el.style.setProperty(item.prop, item.value, item.priority);
        else item.el.style.removeProperty(item.prop);
      }
    };
  }, [pinDocument]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let timer = 0;
    const finishScroll = () => {
      scrollingRef.current = false;
      onScrollEndRef.current?.();
    };
    const onScroll = () => {
      scrollingRef.current = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(finishScroll, scrollEndMs);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [scrollEndMs]);

  return { scrollRef, scrollingRef, onScrollEndRef };
}
