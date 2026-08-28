"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { iosPwaShellStyle, useIosPwaKeyboardShell } from "@/lib/platform/ios-pwa-keyboard-shell";

interface Props {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  /** When true, the main column scrolls (login/forms). Inbox uses nested list scroll. */
  scrollMain?: boolean;
}

export function MailShell({ title, leading, trailing, children, scrollMain = false }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  useIosPwaKeyboardShell(mainRef, true);

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto flex w-full max-w-lg flex-col overflow-hidden bg-slate-200/60 text-gray-900"
      style={iosPwaShellStyle}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white shadow-sm md:border-x border-gray-200/70">
        <header
          className="shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center gap-2"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top))",
            paddingBottom: "0.75rem",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
        >
          {leading}
          <h1 className="flex-1 min-w-0 text-base font-semibold truncate">{title}</h1>
          {trailing}
        </header>
        <main
          ref={mainRef}
          className={`relative flex min-h-0 flex-1 flex-col touch-pan-y [-webkit-overflow-scrolling:touch] ${
            scrollMain ? "overflow-y-auto overflow-x-hidden overscroll-y-contain" : "overflow-hidden"
          }`}
          style={{
            paddingBottom: scrollMain ? "max(1rem, env(safe-area-inset-bottom))" : undefined,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function MailBackLink({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 shrink-0 touch-manipulation"
      aria-label="Назад"
    >
      ←
    </Link>
  );
}
