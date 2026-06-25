"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useChatViewportLayout } from "@/lib/messenger/use-visual-viewport";

type ShellVariant = "default" | "app" | "chat";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  trailing?: ReactNode;
  children: ReactNode;
  variant?: ShellVariant;
  /** Pin header and resize chat area when the iOS keyboard opens. */
  keyboardAware?: boolean;
}

const SHELL_WIDTH: Record<ShellVariant, string | undefined> = {
  default: undefined,
  app: "max-w-lg",
  chat: "max-w-2xl",
};

function lockDocumentScroll() {
  const scrollY = window.scrollY;
  const html = document.documentElement;
  const body = document.body;

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";

  return () => {
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    body.style.overflow = "";
    html.style.overflow = "";
    window.scrollTo(0, scrollY);
  };
}

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
  const viewport = useChatViewportLayout(trackKeyboard);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (!trackKeyboard) return;
    return lockDocumentScroll();
  }, [trackKeyboard]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const measure = () => setHeaderHeight(el.offsetHeight);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trackKeyboard, title, subtitle, trailing]);

  const headerInner = (
    <>
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
    </>
  );

  if (trackKeyboard) {
    const effectiveHeaderH = headerHeight > 0 ? headerHeight : 64;
    const contentTop = viewport.top + effectiveHeaderH;

    return (
      <div className={`text-gray-900 ${framed ? "bg-slate-200/60" : "bg-slate-50"}`}>
        <header
          ref={headerRef}
          className="fixed inset-x-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur"
          style={{ top: viewport.top }}
        >
          <div
            className={`mx-auto flex w-full min-w-0 items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${widthClass ?? ""}`}
            style={{
              paddingLeft: "max(1rem, env(safe-area-inset-left))",
              paddingRight: "max(1rem, env(safe-area-inset-right))",
            }}
          >
            {headerInner}
          </div>
        </header>

        <div
          className="fixed inset-x-0 z-40 overflow-hidden"
          style={{ top: contentTop, bottom: viewport.bottomInset }}
        >
          <div
            className={`mx-auto flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden ${
              widthClass ?? ""
            } ${framed ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}` : ""}`}
          >
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
          </div>
        </div>
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
        className={`mx-auto flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden ${
          widthClass ?? ""
        } ${framed ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}` : ""}`}
      >
        <header
          ref={headerRef}
          className="z-10 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          {headerInner}
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
