"use client";

import { useEffect, useRef, useState } from "react";
import {
  TURNSTILE_SITE_KEY,
  isTurnstileRequiredForUi,
} from "@/lib/captcha/turnstile-client";

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
          size?: "normal" | "compact" | "flexible";
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
      if (window.turnstile) {
        resolve();
        return;
      }
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
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const siteKey = TURNSTILE_SITE_KEY;
  const required = isTurnstileRequiredForUi();

  useEffect(() => {
    if (!siteKey || !required) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoadFailed(false);

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
          appearance: "always",
          theme: "auto",
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => {
            setLoadFailed(true);
            onErrorRef.current?.();
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
        onErrorRef.current?.();
      });

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
  }, [siteKey, required, resetKey]);

  if (!siteKey || !required) return null;

  return (
    <div className="w-full space-y-2">
      <div
        ref={containerRef}
        className="flex justify-center w-full min-h-[65px] overflow-visible"
        aria-live="polite"
      />
      {loadFailed && (
        <p className="text-xs text-amber-700 text-center">
          Не удалось загрузить проверку. Обновите страницу или откройте в Safari/Chrome.
        </p>
      )}
    </div>
  );
}

export function turnstileRequiredOnClient(): boolean {
  return isTurnstileRequiredForUi();
}
