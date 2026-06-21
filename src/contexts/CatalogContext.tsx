"use client";

import { createContext, useContext, type ReactNode } from "react";
import { apps, type App } from "@/data/apps";
import { isAppVisibleToViewer } from "@/lib/admin/visibility";

interface CatalogContextValue {
  visibleApps: App[];
  isAdmin: boolean;
  hiddenIds: Set<string>;
  host: string | null;
  isAppVisible: (app: App) => boolean;
}

const CatalogContext = createContext<CatalogContextValue>({
  visibleApps: apps,
  isAdmin: false,
  hiddenIds: new Set(),
  host: null,
  isAppVisible: () => true,
});

export function CatalogProvider({
  children,
  visibleApps,
  isAdmin,
  hiddenIds,
  host,
}: {
  children: ReactNode;
  visibleApps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
  host: string | null;
}) {
  const hiddenSet = new Set(hiddenIds);
  const value: CatalogContextValue = {
    visibleApps,
    isAdmin,
    hiddenIds: hiddenSet,
    host,
    isAppVisible: (app) => isAppVisibleToViewer(app, hiddenSet, isAdmin, host),
  };
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}
