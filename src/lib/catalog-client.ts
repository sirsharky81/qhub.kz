import type { App } from "@/data/apps";
import { platformFetch } from "@/lib/platform/api-client";

export interface CatalogResponse {
  apps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
}

export async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await platformFetch("/api/catalog");
  if (!res.ok) {
    const { apps } = await import("@/data/apps");
    return { apps, isAdmin: false, hiddenIds: [] };
  }
  return res.json() as Promise<CatalogResponse>;
}
