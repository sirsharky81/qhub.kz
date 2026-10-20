"use client";

import type { ReactNode } from "react";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";

/** Single scrollport for the QHub home page (iOS PWA — avoids dual scroll with html/body). */
export function HomeScrollPane({ children }: { children: ReactNode }) {
  const { scrollRef } = useIosSingleScrollPane();

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
