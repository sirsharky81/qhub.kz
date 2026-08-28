"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

export function MailShell({ title, leading, trailing, children }: Props) {
  return (
    <div className="dark fixed inset-0 z-40 flex flex-col bg-black text-white mx-auto max-w-lg w-full">
      <header
        className="shrink-0 border-b border-zinc-800 bg-black/95 backdrop-blur flex items-center gap-2"
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
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

export function MailBackLink({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white shrink-0"
      aria-label="Назад"
    >
      ←
    </Link>
  );
}
