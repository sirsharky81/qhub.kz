"use client";

import type { ReactNode } from "react";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { GlobalMiniPlayer } from "@/components/music/GlobalMiniPlayer";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <FavoritesProvider>
      <MusicPlayerProvider>
        {children}
        <GlobalMiniPlayer />
      </MusicPlayerProvider>
    </FavoritesProvider>
  );
}
