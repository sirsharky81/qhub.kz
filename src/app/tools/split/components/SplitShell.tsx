"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { useViewportShellSync } from "@/lib/messenger/use-visual-viewport";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function SplitShell({ title, subtitle, backHref, trailing, children }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  // Same iOS/PWA keyboard pin as MessengerShell: shell follows visualViewport
  // instead of floating away when Safari pans the layout viewport.
  useViewportShellSync(true);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const pinWindow = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    const scrollFieldIntoView = (field: HTMLElement) => {
      const main = mainRef.current;
      if (!main || !field.isConnected) return;
      const mainRect = main.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const gap = fieldRect.top - mainRect.top;
      const desiredTop = Math.min(96, Math.max(48, mainRect.height * 0.22));
      main.scrollTo({
        top: main.scrollTop + gap - desiredTop,
        behavior: "auto",
      });
      pinWindow();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isEditableTarget(event.target)) return;
      const field = event.target;
      scrollFieldIntoView(field);
      requestAnimationFrame(() => scrollFieldIntoView(field));
      window.setTimeout(() => scrollFieldIntoView(field), 120);
      window.setTimeout(() => scrollFieldIntoView(field), 280);
      window.setTimeout(() => scrollFieldIntoView(field), 520);
    };

    const vv = window.visualViewport;
    const onViewportShift = () => {
      const active = document.activeElement;
      if (isEditableTarget(active)) scrollFieldIntoView(active);
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
  }, []);

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto flex w-full max-w-lg flex-col overflow-hidden text-slate-900 shadow-sm md:border-x border-emerald-900/10 bg-[#e8f0ec]"
      style={{
        top: "var(--messenger-vv-top, 0px)",
        height: "var(--messenger-vvh, 100dvh)",
      }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f7fbf8]">
        <header
          className="z-20 shrink-0 border-b border-emerald-900/10 bg-[#f7fbf8]/95 backdrop-blur px-3 py-2 flex items-center gap-1.5"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
        >
          {backHref && (
            <Link
              href={backHref}
              className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-900/60 hover:bg-emerald-900/5 shrink-0 touch-manipulation text-sm"
              aria-label="Назад"
            >
              ←
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate leading-tight tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-[11px] text-emerald-900/55 truncate leading-snug mt-0.5">{subtitle}</p>
            )}
          </div>
          {trailing}
        </header>
        <main
          ref={mainRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0px, env(safe-area-inset-left))",
            paddingRight: "max(0px, env(safe-area-inset-right))",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
