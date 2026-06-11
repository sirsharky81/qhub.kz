"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apps, type App } from "@/data/apps";
import { loadFavorites, saveFavorites } from "@/lib/favorites/storage";

interface FavoritesContextValue {
  pinnedIds: string[];
  pinnedApps: App[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  reorderPinned: (fromIndex: number, toIndex: number) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPinnedIds(loadFavorites().pinnedIds);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveFavorites({ pinnedIds });
  }, [pinnedIds, hydrated]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  const reorderPinned = useCallback((fromIndex: number, toIndex: number) => {
    setPinnedIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const pinnedApps = useMemo(() => {
    const map = new Map(apps.map((a) => [a.id, a]));
    return pinnedIds.map((id) => map.get(id)).filter((a): a is App => !!a && !a.comingSoon);
  }, [pinnedIds]);

  const value: FavoritesContextValue = {
    pinnedIds,
    pinnedApps,
    isPinned: (id) => pinnedIds.includes(id),
    togglePin,
    reorderPinned,
  };

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
