"use client";

import { useEffect, type RefObject } from "react";
import { useViewportShellSync } from "@/lib/messenger/use-visual-viewport";

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function scrollFieldIntoView(main: HTMLElement, field: HTMLElement): void {
  if (!field.isConnected) return;
  const mainRect = main.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  const gap = fieldRect.top - mainRect.top;
  const desiredTop = Math.min(96, Math.max(48, mainRect.height * 0.22));
  main.scrollTo({
    top: main.scrollTop + gap - desiredTop,
    behavior: "auto",
  });
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * Pins a fixed mobile shell to visualViewport and keeps focused inputs visible on iOS PWA.
 * Used by mail, split, and other full-screen tool shells.
 */
export function useIosPwaKeyboardShell(mainRef: RefObject<HTMLElement | null>, enabled = true): void {
  useViewportShellSync(enabled);

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const pinWindow = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    const scrollActiveField = (field: HTMLElement) => {
      const main = mainRef.current;
      if (!main) return;
      scrollFieldIntoView(main, field);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isEditableTarget(event.target)) return;
      const field = event.target;
      scrollActiveField(field);
      requestAnimationFrame(() => scrollActiveField(field));
      window.setTimeout(() => scrollActiveField(field), 120);
      window.setTimeout(() => scrollActiveField(field), 280);
      window.setTimeout(() => scrollActiveField(field), 520);
    };

    const vv = window.visualViewport;
    const onViewportShift = () => {
      const active = document.activeElement;
      if (isEditableTarget(active)) scrollActiveField(active);
      else pinWindow();
    };

    document.addEventListener("focusin", onFocusIn);
    vv?.addEventListener("resize", onViewportShift);
    vv?.addEventListener("scroll", onViewportShift);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", onViewportShift);
      vv?.removeEventListener("scroll", onViewportShift);
    };
  }, [enabled, mainRef]);
}

export const iosPwaShellStyle = {
  top: "var(--messenger-vv-top, 0px)",
  height: "var(--messenger-vvh, 100dvh)",
} as const;
