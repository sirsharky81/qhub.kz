"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY, isTurnstileRequired } from "@/lib/captcha/turnstile-client";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile load failed")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(script);
  });
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  resetKey?: number;
}

export function TurnstileWidget({ onToken, onExpire, onError, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey = TURNSTILE_SITE_KEY;
  const required = isTurnstileRequired();

  useEffect(() => {
    if (!siteKey || !required) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token) => onToken(token),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => onError?.(),
        });
      })
      .catch(() => onError?.());

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, required, resetKey, onToken, onExpire, onError]);

  if (!siteKey || !required) return null;

  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />;
}

export function turnstileRequiredOnClient(): boolean {
  return isTurnstileRequired();
}
