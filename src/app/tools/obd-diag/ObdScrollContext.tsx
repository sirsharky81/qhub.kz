"use client";

import { createContext, useContext, type RefObject } from "react";

export type ObdScrollContextValue = {
  scrollingRef: RefObject<boolean>;
  deferUiUpdate: (apply: () => void) => void;
  registerScrollFlush: (flush: () => void) => () => void;
};

const ObdScrollContext = createContext<ObdScrollContextValue | null>(null);

export function useObdScroll(): ObdScrollContextValue | null {
  return useContext(ObdScrollContext);
}

export default ObdScrollContext;
