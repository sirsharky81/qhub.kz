"use client";

import { useSyncExternalStore } from "react";

function subscribeCoarsePointer(onChange: () => void): () => void {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getCoarsePointerSnapshot(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function getCoarsePointerServerSnapshot(): boolean {
  return false;
}

/** True on phones/tablets — prefer tap over HTML5 drag. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
}
