"use client";

import { useSyncExternalStore } from "react";

function subscribeLandscapePhone(onChange: () => void): () => void {
  const mq = window.matchMedia("(max-width: 640px) and (orientation: landscape)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getLandscapePhoneSnapshot(): boolean {
  return window.matchMedia("(max-width: 640px) and (orientation: landscape)").matches;
}

/** Phone held sideways — fit board to viewport height. */
export function useLandscapePhone(): boolean {
  return useSyncExternalStore(
    subscribeLandscapePhone,
    getLandscapePhoneSnapshot,
    () => false,
  );
}
