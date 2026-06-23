"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type ShellVariant = "default" | "app" | "chat";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
  variant?: ShellVariant;
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
}: Props) {
  const widthClass = SHELL_WIDTH[variant];
  const framed = variant !== "default";

  return (
    <div
      className={`flex flex-col min-h-[100dvh] text-gray-900 ${
        framed ? "bg-slate-200/60" : "bg-slate-50"
      }`}
    >
      <div
        className={`flex flex-col min-h-[100dvh] w-full mx-auto ${
          widthClass ?? ""
        } ${framed ? "bg-white shadow-sm md:border-x border-gray-200/70" : ""}`}
      >
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 shrink-0">
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
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </div>
    </div>
  );
}
