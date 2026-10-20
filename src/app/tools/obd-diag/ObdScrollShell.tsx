"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";
import ObdScrollContext from "./ObdScrollContext";

const MAX_DEFERRED_UPDATES = 16;

export function ObdScrollShell({ children }: { children: ReactNode }) {
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
      <div
        ref={scrollRef}
        className="bg-slate-950 text-slate-100"
        style={{
          position: "fixed",
          inset: 0,
          overflowX: "clip",
          overflowY: "auto",
          overscrollBehavior: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          transform: "translateZ(0)",
        }}
      >
        <div
          className="mx-auto max-w-lg min-w-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
          {children}
        </div>
      </div>
    </ObdScrollContext.Provider>
  );
}
