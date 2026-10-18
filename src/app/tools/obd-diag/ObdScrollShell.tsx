"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";
import ObdScrollContext from "./ObdScrollContext";

export function ObdScrollShell({ children }: { children: ReactNode }) {
  const { scrollRef, scrollingRef, onScrollEndRef } = useIosSingleScrollPane();
  const deferredRef = useRef<(() => void)[]>([]);
  const flushCallbacksRef = useRef(new Set<() => void>());

  const deferUiUpdate = useCallback(
    (apply: () => void) => {
      if (scrollingRef.current) deferredRef.current.push(apply);
      else apply();
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
      const deferred = deferredRef.current.splice(0);
      for (const fn of deferred) fn();
      for (const fn of flushCallbacksRef.current) fn();
    };
    onScrollEndRef.current = runFlushes;
    return () => {
      if (onScrollEndRef.current === runFlushes) onScrollEndRef.current = null;
    };
  }, [onScrollEndRef]);

  return (
    <ObdScrollContext.Provider value={{ scrollingRef, deferUiUpdate, registerScrollFlush }}>
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
        }}
      >
        <div className="mx-auto max-w-lg min-w-0 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </ObdScrollContext.Provider>
  );
}
