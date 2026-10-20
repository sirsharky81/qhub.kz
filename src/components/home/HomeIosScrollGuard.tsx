"use client";

import { useEffect } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

/**
 * iOS PWA: after rubber-band at scrollTop=0, downward scroll often jitters.
 * Block only pull-down overscroll at the top; normal scroll-down stays native.
 */
export function HomeIosScrollGuard() {
  const coarsePointer = useCoarsePointer();

  useEffect(() => {
    if (coarsePointer !== true) return;

    const scroller = document.scrollingElement ?? document.documentElement;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (scroller.scrollTop > 0) return;
      const currentY = event.touches[0].clientY;
      if (currentY > startY) event.preventDefault();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [coarsePointer]);

  return null;
}
