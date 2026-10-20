"use client";

import { useEffect, useState } from "react";

/** True on typical phones (touch-first). Null until mounted. */
export function useCoarsePointer(): boolean | null {
  const [coarse, setCoarse] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return coarse;
}
