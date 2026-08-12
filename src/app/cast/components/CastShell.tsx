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
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
              ← На главную
            </Link>
            {trailing}
          </div>
          <div className="flex items-center gap-2">
            {backHref && (
              <Link
                href={backHref}
                onClick={() => onBack?.()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Назад"
              >
                ←
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-gray-500 leading-snug">{subtitle}</p>
              )}
            </div>
          </div>
        </header>
        <main
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
