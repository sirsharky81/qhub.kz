"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
}

export function SplitShell({ title, subtitle, backHref, trailing, children }: Props) {
  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#e8f0ec] text-slate-900">
      <div className="flex flex-col h-full w-full min-w-0 mx-auto max-w-lg overflow-hidden bg-[#f7fbf8] shadow-sm md:border-x border-emerald-900/10">
        <header
          className="sticky top-0 z-20 border-b border-emerald-900/10 bg-[#f7fbf8]/95 backdrop-blur px-3 py-2 flex items-center gap-1.5 shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]"
          style={{
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
