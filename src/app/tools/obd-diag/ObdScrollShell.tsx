"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import ServicePageHeader from "@/components/ServicePageHeader";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";
import ObdScrollContext from "./ObdScrollContext";
import { ObdDeployGuard } from "./ObdDeployGuard";

const MAX_DEFERRED_UPDATES = 16;

export function ObdScrollShell({
  children,
  pageBuildId,
  title,
  iconSrc,
}: {
  children: ReactNode;
  pageBuildId: string;
  title: string;
  iconSrc: string;
}) {
  const { scrollRef, scrollingRef, onScrollEndRef } = useIosSingleScrollPane({ scrollEndMs: 240 });
  const deferredRef = useRef<(() => void)[]>([]);
  const flushCallbacksRef = useRef(new Set<() => void>());

  const deferUiUpdate = useCallback(
    (apply: () => void) => {
      if (!scrollingRef.current) {
        apply();
        return;
      }
      deferredRef.current.push(apply);
      if (deferredRef.current.length > MAX_DEFERRED_UPDATES) {
        deferredRef.current = deferredRef.current.slice(-MAX_DEFERRED_UPDATES);
      }
    },
    [scrollingRef],
  );

  const registerScrollFlush = useCallback((flush: () => void) => {
    flushCallbacksRef.current.add(flush);
    return () => {
      flushCallbacksRef.current.delete(flush);
    };
  }, []);

  useEffect(() => {
    const runFlushes = () => {
      for (const fn of flushCallbacksRef.current) fn();
      const deferred = deferredRef.current.splice(0);
      if (deferred.length === 0) return;
      requestAnimationFrame(() => {
        for (const fn of deferred) fn();
      });
    };
    onScrollEndRef.current = runFlushes;
    return () => {
      if (onScrollEndRef.current === runFlushes) onScrollEndRef.current = null;
    };
  }, [onScrollEndRef]);

  const scrollContextValue = useMemo(
    () => ({ scrollingRef, deferUiUpdate, registerScrollFlush }),
    [deferUiUpdate, registerScrollFlush],
  );

  return (
    <ObdScrollContext.Provider value={scrollContextValue}>
      <div className="fixed inset-0 flex min-h-[100dvh] flex-col bg-white text-gray-900">
        <div className="shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <ServicePageHeader
            className="bg-white border-gray-200 dark:bg-white dark:border-gray-200"
            trailing={
              <Link
                href="/"
                className="hidden text-xs text-gray-400 transition-colors hover:text-gray-700 sm:block"
              >
                ← Все приложения
              </Link>
            }
          >
            <span className="shrink-0 select-none text-gray-300">/</span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="h-5 w-5 shrink-0 overflow-hidden rounded-[22%] shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSrc} alt="" className="h-full w-full object-cover" />
              </div>
              <span className="truncate text-xs font-medium text-gray-800 sm:text-sm">{title}</span>
            </div>
          </ServicePageHeader>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1"
          style={{
            overflowX: "clip",
            overflowY: "auto",
            overscrollBehavior: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            transform: "translateZ(0)",
          }}
        >
          <div className="mx-auto min-w-0 max-w-lg px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            <ObdDeployGuard pageBuildId={pageBuildId} />
            {children}
          </div>
        </div>
      </div>
    </ObdScrollContext.Provider>
  );
}
