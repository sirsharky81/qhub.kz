"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apps, type App } from "@/data/apps";
import { fetchCatalog } from "@/lib/catalog-client";
import { setRemoteFlags } from "@/lib/platform/features";
import { platformFetch } from "@/lib/platform/api-client";

interface CatalogBootstrapProps {
  children: (catalog: {
    visibleApps: App[];
    isAdmin: boolean;
    hiddenIds: string[];
    host: string | null;
    loaded: boolean;
  }) => ReactNode;
}

export function CatalogBootstrap({ children }: CatalogBootstrapProps) {
  const [visibleApps, setVisibleApps] = useState<App[]>(() =>
    apps.filter((app) => app.gatedBy !== "vpn"),
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const host = typeof window !== "undefined" ? window.location.host : null;

  useEffect(() => {
    void fetchCatalog().then((catalog) => {
      setVisibleApps(catalog.apps);
      setIsAdmin(catalog.isAdmin);
      setHiddenIds(catalog.hiddenIds);
      setLoaded(true);
    });

    void platformFetch("/api/app/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { remoteFlags?: Record<string, boolean> } | null) => {
        if (config?.remoteFlags) setRemoteFlags(config.remoteFlags);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {children({ visibleApps, isAdmin, hiddenIds, host, loaded })}
    </>
  );
}
