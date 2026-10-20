"use client";

import { createContext, useContext, type ReactNode } from "react";
import { apps, type App } from "@/data/apps";
import { isAppVisibleToViewer } from "@/lib/admin/visibility";

interface CatalogContextValue {
  visibleApps: App[];
  isAdmin: boolean;
  hiddenIds: Set<string>;
  host: string | null;
  catalogReady: boolean;
  isAppVisible: (app: App) => boolean;
}

const CatalogContext = createContext<CatalogContextValue>({
  visibleApps: apps,
  isAdmin: false,
  hiddenIds: new Set(),
  host: null,
  catalogReady: false,
  isAppVisible: () => true,
});

export function CatalogProvider({
  children,
  visibleApps,
  isAdmin,
  hiddenIds,
  host,
  catalogReady,
}: {
  children: ReactNode;
  visibleApps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
  host: string | null;
  catalogReady: boolean;
}) {
  const hiddenSet = new Set(hiddenIds);
  const value: CatalogContextValue = {
    visibleApps,
    isAdmin,
    hiddenIds: hiddenSet,
    host,
    catalogReady,
    isAppVisible: (app) => isAppVisibleToViewer(app, hiddenSet, isAdmin, host),
  };
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}
