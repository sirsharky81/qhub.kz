import { FAVORITES_STORAGE_KEY, type FavoritesState } from "./types";

const DEFAULT: FavoritesState = { pinnedIds: [] };

export function loadFavorites(): FavoritesState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as FavoritesState;
    if (!Array.isArray(parsed.pinnedIds)) return DEFAULT;
    return { pinnedIds: parsed.pinnedIds.filter((id) => typeof id === "string") };
  } catch {
    return DEFAULT;
  }
}

export function saveFavorites(state: FavoritesState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state));
}
