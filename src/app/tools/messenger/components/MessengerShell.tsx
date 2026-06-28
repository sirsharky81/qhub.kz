"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ReactNode } from "react";
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
  // keyboardOpen is used only by ChatComposer (via its own hook call).
  // The shell itself uses CSS `height: 100dvh` which the browser updates
  // synchronously — no JS frame lag, no translateY hacks needed.
  useViewportState(trackKeyboard); // keep hook alive for ChatComposer's instance

  // Prevent iOS from auto-scrolling the page when the keyboard opens,
  // which would shift the layout viewport and misplace fixed elements.
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
    // ─── iOS / Android PWA keyboard layout ───────────────────────────────────
    //
    // Key insight: JS-based height adjustments have a ~1 rAF frame lag.
    // In that 16 ms window, iOS may pan the web view to reveal a focused input,
    // causing vv.offsetTop > 0 and making the header jump or disappear.
    //
    // Solution: CSS `height: 100dvh`.
    //   - `dvh` (dynamic viewport height) is 1% of the visible viewport height.
    //   - On iOS 16.4+ / Android Chrome 108+, it updates SYNCHRONOUSLY with the
    //     keyboard animation — no JS frame lag, no iOS pan, no header jump.
    //   - The browser guarantees the shell always fills the space above the keyboard.
    //   - No `transform`, no `vv.offsetTop` compensation needed.
    //
    // `interactiveWidget: resizes-visual` in layout.tsx makes vv.height (and
    // therefore dvh) shrink when the keyboard opens, which is exactly what we need.
    //
    // Safe-area padding:
    //   - Header handles its own top safe-area via paddingTop.
    //   - ChatComposer toggles paddingBottom: env(safe-area-inset-bottom) on/off
    //     using the `keyboardOpen` boolean from useViewportState so the home
    //     indicator is covered when needed without adding a gap above the keyboard.

    return (
      <div
        className={`fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden text-gray-900 ${
          framed
            ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}`
            : "bg-slate-50"
        } ${widthClass ? `mx-auto ${widthClass}` : "w-full"}`}
        style={{ height: "100dvh" }}
      >
        {header}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
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
