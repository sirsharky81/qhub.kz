"use client";

import type { ReactNode } from "react";
import { CatalogProvider } from "@/contexts/CatalogContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { GlobalMiniPlayer } from "@/components/music/GlobalMiniPlayer";
import { AdminViewBadge } from "@/components/admin/AdminViewBadge";
import { CatalogBootstrap } from "@/components/providers/CatalogBootstrap";
import type { App } from "@/data/apps";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <CatalogBootstrap>
      {({ visibleApps, isAdmin, hiddenIds, host }) => (
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
      )}
    </CatalogBootstrap>
  );
}
