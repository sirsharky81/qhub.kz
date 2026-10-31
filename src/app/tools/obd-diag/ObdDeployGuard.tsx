"use client";

import { useCallback, useEffect, useState } from "react";

const RELOAD_KEY = "qhub.obd.chunk-reload";

function isChunkLoadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("loading chunk") ||
    m.includes("chunkloaderror") ||
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed")
  );
}

export function ObdDeployGuard({ pageBuildId }: { pageBuildId: string }) {
  const [stale, setStale] = useState(false);

  const hardReload = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("_obd", String(Date.now()));
    window.location.replace(url.toString());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkBuild = async () => {
      try {
        const res = await fetch("/api/app/build-id", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { buildId?: string };
        if (data.buildId && data.buildId !== pageBuildId) {
          setStale(true);
        }
      } catch {
        /* offline */
      }
    };

    void checkBuild();

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkBuild();
    };
    document.addEventListener("visibilitychange", onVisible);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/sw.js").then((reg) => reg?.update());
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pageBuildId]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message ?? "";
      if (!isChunkLoadError(msg)) return;
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      hardReload();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (!isChunkLoadError(msg)) return;
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      hardReload();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [hardReload]);

  useEffect(() => {
    sessionStorage.removeItem(RELOAD_KEY);
  }, [pageBuildId]);

  if (!stale) return null;

  return (
    <div className="sticky top-0 z-50 -mx-4 mb-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 shadow-sm">
      <p className="font-medium">Доступна новая версия OBD Scanner.</p>
      <button
        type="button"
        onClick={hardReload}
        className="mt-1.5 rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
      >
        Обновить сейчас
      </button>
    </div>
  );
}
