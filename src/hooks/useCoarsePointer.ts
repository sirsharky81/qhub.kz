"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** True on phones/tablets with touch as primary input — not on narrow desktop windows. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return coarse;
}
