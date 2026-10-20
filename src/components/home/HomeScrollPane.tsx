"use client";

import type { ReactNode } from "react";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

/**
 * iPhone / touch: one fixed inner scrollport (document pinned) — avoids iOS dual-scroll jitter.
 * Desktop: normal document flow.
 */
export function HomeScrollPane({ children }: { children: ReactNode }) {
  const coarsePointer = useCoarsePointer();
  const pinDocument = coarsePointer === true;
  const { scrollRef } = useIosSingleScrollPane({ pinDocument, scrollEndMs: 200 });

  if (!pinDocument) {
    return <div className="flex min-h-svh flex-col bg-white text-gray-900">{children}</div>;
  }

  return (
    <div
      ref={scrollRef}
      id="qhub-home-scroll"
      className="bg-white text-gray-900"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflowX: "clip",
        overflowY: "auto",
        overscrollBehavior: "none",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
      }}
    >
      {children}
    </div>
  );
}
