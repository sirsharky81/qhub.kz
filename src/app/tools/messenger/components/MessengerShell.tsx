"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useViewportShellSync } from "@/lib/messenger/use-visual-viewport";

type ShellVariant = "default" | "app" | "chat";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  variant?: ShellVariant;
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
  leading,
  children,
  variant = "default",
  keyboardAware,
}: Props) {
  const widthClass = SHELL_WIDTH[variant];
  const framed = variant !== "default";
  const isChat = variant === "chat";
  const trackKeyboard = keyboardAware ?? isChat;

  useViewportShellSync(trackKeyboard);

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
      {leading && <div className="shrink-0">{leading}</div>}
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
    return (
      <div
        className={`fixed inset-x-0 z-40 flex flex-col overflow-hidden text-gray-900 ${
          framed
            ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}`
            : "bg-slate-50"
        } ${widthClass ? `mx-auto ${widthClass}` : "w-full"}`}
        style={{
          top: "var(--messenger-vv-top, 0px)",
          height: "var(--messenger-vvh, 100dvh)",
        }}
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
