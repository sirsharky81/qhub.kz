"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useKeyboardInset } from "@/lib/messenger/use-visual-viewport";

type ShellVariant = "default" | "app" | "chat";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
  variant?: ShellVariant;
  /** Lift content above the iOS virtual keyboard; keeps header fixed at the top. */
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
  const keyboardInset = useKeyboardInset(trackKeyboard);

  useEffect(() => {
    if (!trackKeyboard) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [trackKeyboard]);

  return (
    <div
      className={`flex flex-col overflow-hidden text-gray-900 ${
        trackKeyboard
          ? "fixed inset-x-0 top-0 z-40 h-[100dvh] max-h-[100dvh]"
          : "min-h-[100dvh] max-h-[100dvh]"
      } ${framed ? "bg-slate-200/60" : "bg-slate-50"}`}
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      <div
        className={`flex flex-col h-full max-h-full w-full min-w-0 mx-auto overflow-hidden ${
          widthClass ?? ""
        } ${framed ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}` : ""}`}
      >
        <header
          className="z-10 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{
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
            {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
          {trailing && <div className="shrink-0">{trailing}</div>}
        </header>
        <main className="relative flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
