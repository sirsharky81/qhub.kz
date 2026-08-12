"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  /** Called before navigating back (e.g. purge ephemeral upload). */
  onBack?: () => void;
  trailing?: ReactNode;
  children: ReactNode;
}

export function CastShell({ title, subtitle, backHref, onBack, trailing, children }: Props) {
  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-200/60 text-gray-900">
      <div className="flex flex-col h-full w-full min-w-0 mx-auto overflow-hidden max-w-lg bg-white shadow-sm md:border-x border-gray-200/70">
        <header
          className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur px-3 py-2 flex items-center gap-1.5 shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]"
          style={{
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
        >
          {backHref && (
            <Link
              href={backHref}
              onClick={() => onBack?.()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-100 shrink-0 touch-manipulation text-sm"
              aria-label="Назад"
            >
              ←
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-[11px] text-gray-500 truncate leading-snug mt-0.5">{subtitle}</p>
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
