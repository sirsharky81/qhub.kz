"use client";

import type { ReactNode } from "react";
import { CatalogProvider } from "@/contexts/CatalogContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { GlobalMiniPlayer } from "@/components/music/GlobalMiniPlayer";
import { AdminViewBadge } from "@/components/admin/AdminViewBadge";
import type { App } from "@/data/apps";

interface AppProvidersProps {
  children: ReactNode;
  visibleApps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
  host: string | null;
}

export function AppProviders({
  children,
  visibleApps,
  isAdmin,
  hiddenIds,
  host,
}: AppProvidersProps) {
  return (
    <CatalogProvider
      visibleApps={visibleApps}
      isAdmin={isAdmin}
      hiddenIds={hiddenIds}
      host={host}
    >
      <FavoritesProvider>
        <MusicPlayerProvider>
          {children}
          <AdminViewBadge />
          <GlobalMiniPlayer />
        </MusicPlayerProvider>
      </FavoritesProvider>
    </CatalogProvider>
  );
}
