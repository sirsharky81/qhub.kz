"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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

  // This hook's primary job here is to keep the --messenger-vvh CSS variable
  // in sync with the visual viewport height (see use-visual-viewport.ts).
  useViewportState(trackKeyboard);

  // Keep <body> from scrolling so iOS cannot auto-pan the web view when the
  // keyboard opens.  Belt-and-suspenders: the CSS-var approach already
  // prevents the pan by updating the shell height before iOS can act.
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

  // #region agent log
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!trackKeyboard) return;
    const vv = window.visualViewport;
    const logShell = () => {
      const el = shellRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      fetch('http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9851b9'},body:JSON.stringify({sessionId:'9851b9',location:'MessengerShell.tsx:shellRect',message:'Shell bounding rect',data:{top:r.top,bottom:r.bottom,height:r.height,width:r.width,computedHeight:cs.height,computedTransform:cs.transform,vvOffsetTop:vv?Math.round(vv.offsetTop):null,vvHeight:vv?Math.round(vv.height):null},timestamp:Date.now(),hypothesisId:'A-B'})}).catch(()=>{});
    };
    const delay = setTimeout(logShell, 500);
    vv?.addEventListener('resize', logShell);
    return () => { clearTimeout(delay); vv?.removeEventListener('resize', logShell); };
  }, [trackKeyboard]);
  // #endregion

  if (trackKeyboard) {
    return (
      <div
        ref={shellRef}
        className={`fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden text-gray-900 ${
          framed
            ? `bg-white ${isChat ? "" : "shadow-sm md:border-x border-gray-200/70"}`
            : "bg-slate-50"
        } ${widthClass ? `mx-auto ${widthClass}` : "w-full"}`}
        style={{ height: "var(--messenger-vvh, 100dvh)" }}
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
