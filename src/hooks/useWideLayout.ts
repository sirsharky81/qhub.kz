"use client";

import { useEffect, useState } from "react";

/** True at Tailwind `md` breakpoint and above — matches desktop multi-column layout. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return wide;
}
