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
      if (scroller.scrollTop > 2) return;

      const currentY = event.touches[0].clientY;
      if (currentY > startY) event.preventDefault();
    };

    const onTouchEnd = () => {
      if (scroller.scrollTop <= 0) {
        scroller.scrollTop = 0;
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [coarsePointer]);

  return null;
}
