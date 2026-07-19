import bundlesJson from "@/data/kz-regions/index.json";
import type { KzMapRegionBundle } from "./types";

const BUNDLES_BASE =
  process.env.NEXT_PUBLIC_KZ_MAPS_BUNDLES_BASE?.trim().replace(/\/$/, "") ||
  "/kz-maps/bundles";

export function getKzRegionBundles(): KzMapRegionBundle[] {
  const raw = bundlesJson.bundles as Omit<
    KzMapRegionBundle,
    "pmtilesUrl" | "placesBundleUrl"
  >[];

  return raw.map((b) => ({
    ...b,
    pmtilesUrl: `${BUNDLES_BASE}/${b.id}.pmtiles`,
    placesBundleUrl: `/api/kz-maps/bundles/${encodeURIComponent(b.id)}/places`,
  }));
}

export function getKzRegionBundle(id: string): KzMapRegionBundle | null {
  return getKzRegionBundles().find((b) => b.id === id) ?? null;
}

export function formatBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} ГБ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} МБ`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} КБ`;
  return `${n} Б`;
}
