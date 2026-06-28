"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useViewportState } from "@/lib/messenger/use-visual-viewport";

type ShellVariant = "default" | "app" | "chat";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
  variant?: ShellVariant;
  /** Lift content above the iOS/Android virtual keyboard. */
  keyboardAware?: boolean;
}

const SHELL_WIDTH: Record<ShellVariant, string | undefined> = {
  default: undefined,
  app: "max-w-lg",
  chat: "max-w-2xl",
};

export function MessengerShell({
  title,
  subtitle,
  backHref,
  trailing,
  children,
  variant = "default",
  keyboardAware,
}: Props) {
  const widthClass = SHELL_WIDTH[variant];
  const framed = variant !== "default";
  const isChat = variant === "chat";
  const trackKeyboard = keyboardAware ?? isChat;
  const { vvHeight, vvOffsetTop } = useViewportState(trackKeyboard);

  // Lock scroll so iOS cannot auto-scroll the page when the keyboard opens.
  // This works on most iOS versions; for those where it still scrolls,
  // we compensate with translateY(vvOffsetTop) below.
  useEffect(() => {
    if (!trackKeyboard) return;
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
  }, [trackKeyboard]);

  const header = (
    <header
      className="relative z-10 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center gap-3"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "0.75rem",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {backHref && (
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 shrink-0"
          aria-label="Назад"
        >
          ←
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold truncate">{title}</h1>
        {subtitle && (
          <div className="text-xs text-gray-500 mt-0.5 min-h-[1.125rem] leading-tight">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );

  if (trackKeyboard) {
    // ─── iOS PWA keyboard layout strategy ───────────────────────────────────
    //
    // Two things happen on iOS when the virtual keyboard opens:
    //
    // 1. vv.height shrinks  → the visible area above the keyboard is smaller.
    //    We set `height: vvHeight` on the content div so it never extends
    //    behind the keyboard.
    //
    // 2. iOS auto-scrolls the page upward to keep the focused input visible
    //    (vv.offsetTop > 0), even though we set overflow:hidden on <body>.
    //    A `position:fixed` element stays at layout y=0, but the visual
    //    viewport top is now at layout y=vv.offsetTop.  The result: the top
    //    `vv.offsetTop` pixels of our shell are above the visible screen,
    //    hiding the header.
    //
    // Fix: `transform: translateY(vv.offsetTop)` slides the content div down
    // so its top edge aligns with the visual viewport top at all times.
    // The GPU-composited transform has zero layout cost and tracks the scroll
    // smoothly (within one rAF frame).
    //
    // When vvHeight is 0 (SSR / before mount) we fall back to `bottom:0` so
    // the shell fills the full screen without a flash.

    const innerStyle: CSSProperties =
      vvHeight > 0
        ? {
            height: `${vvHeight}px`,
            transform: vvOffsetTop > 0 ? `translateY(${vvOffsetTop}px)` : undefined,
          }
        : { bottom: 0 };

    return (
      <>
        {/* Background layer fills the full screen so the area behind the
            keyboard (and below the shell on scroll) shows a consistent colour
            instead of whatever is underneath the web view. */}
        <div
          className={`fixed inset-0 z-40 ${framed ? "bg-white" : "bg-slate-50"}`}
        />

        {/* Content layer: exactly tracks the visual viewport */}
        <div
          className={`fixed inset-x-0 top-0 z-50 flex flex-col overflow-hidden text-gray-900 ${
            framed
              ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}`
              : "bg-slate-50"
          } ${widthClass ? `mx-auto ${widthClass}` : "w-full"}`}
          style={innerStyle}
        >
          {header}
          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </>
    );
  }

  return (
    <div
      className={`flex min-h-[100dvh] max-h-[100dvh] flex-col overflow-hidden text-gray-900 ${
        framed ? "bg-slate-200/60" : "bg-slate-50"
      }`}
    >
      <div
        className={`mx-auto flex h-full w-full min-w-0 flex-col overflow-hidden ${
          widthClass ?? ""
        } ${framed ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}` : ""}`}
      >
        {header}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
