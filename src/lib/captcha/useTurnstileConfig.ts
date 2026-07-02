"use client";

import { useEffect, useState } from "react";
import { platformFetch } from "@/lib/platform/api-client";
import { TURNSTILE_SITE_KEY } from "./turnstile-client";

export interface TurnstileRuntimeConfig {
  enabled: boolean;
  siteKey: string;
  loading: boolean;
  unavailable: boolean;
}

let cachedConfig: Omit<TurnstileRuntimeConfig, "loading"> | null = null;
let inflight: Promise<Omit<TurnstileRuntimeConfig, "loading">> | null = null;

async function loadTurnstileConfig(): Promise<Omit<TurnstileRuntimeConfig, "loading">> {
  if (cachedConfig) return cachedConfig;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await platformFetch("/api/captcha/turnstile-config");
      if (!res.ok) {
        return {
          enabled: false,
          siteKey: TURNSTILE_SITE_KEY,
          unavailable: !TURNSTILE_SITE_KEY,
        };
      }
      const data = (await res.json()) as { enabled?: boolean; siteKey?: string };
      const siteKey =
        typeof data.siteKey === "string" && data.siteKey.trim()
          ? data.siteKey.trim()
          : TURNSTILE_SITE_KEY;
      const enabled = Boolean(data.enabled && siteKey);
      const config = { enabled, siteKey, unavailable: !enabled };
      cachedConfig = config;
      return config;
    } catch {
      const fallback = {
        enabled: Boolean(TURNSTILE_SITE_KEY),
        siteKey: TURNSTILE_SITE_KEY,
        unavailable: !TURNSTILE_SITE_KEY,
      };
      cachedConfig = fallback;
      return fallback;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function useTurnstileConfig(): TurnstileRuntimeConfig {
  const [state, setState] = useState<TurnstileRuntimeConfig>(() => ({
    enabled: Boolean(TURNSTILE_SITE_KEY),
    siteKey: TURNSTILE_SITE_KEY,
    loading: true,
    unavailable: false,
  }));

  useEffect(() => {
    let cancelled = false;
    void loadTurnstileConfig().then((config) => {
      if (cancelled) return;
      setState({ ...config, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function resetTurnstileConfigCache(): void {
  cachedConfig = null;
  inflight = null;
}
