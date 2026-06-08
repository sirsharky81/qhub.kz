import type { RegionRate } from "./schema";

export const REGIONS: RegionRate[] = [
  { id: "default", labelKey: "region.default", simplifiedRate: 0.04 },
  { id: "almaty_city", labelKey: "region.almaty_city", simplifiedRate: 0.03 },
  { id: "astana", labelKey: "region.astana", simplifiedRate: 0.03 },
  { id: "shymkent", labelKey: "region.shymkent", simplifiedRate: 0.02 },
  { id: "karaganda", labelKey: "region.karaganda", simplifiedRate: 0.03 },
  { id: "aktobe", labelKey: "region.aktobe", simplifiedRate: 0.04 },
  { id: "pavlodar", labelKey: "region.pavlodar", simplifiedRate: 0.03 },
  { id: "east_kazakhstan", labelKey: "region.east_kazakhstan", simplifiedRate: 0.04 },
  { id: "west_kazakhstan", labelKey: "region.west_kazakhstan", simplifiedRate: 0.04 },
  { id: "north_kazakhstan", labelKey: "region.north_kazakhstan", simplifiedRate: 0.04 },
  { id: "zhambyl", labelKey: "region.zhambyl", simplifiedRate: 0.03 },
  { id: "kyzylorda", labelKey: "region.kyzylorda", simplifiedRate: 0.04 },
  { id: "mangistau", labelKey: "region.mangistau", simplifiedRate: 0.04 },
  { id: "atyrau", labelKey: "region.atyrau", simplifiedRate: 0.04 },
  { id: "kostanay", labelKey: "region.kostanay", simplifiedRate: 0.04 },
  { id: "aktau", labelKey: "region.aktau", simplifiedRate: 0.04 },
  { id: "turkestan", labelKey: "region.turkestan", simplifiedRate: 0.03 },
  { id: "almaty_region", labelKey: "region.almaty_region", simplifiedRate: 0.04 },
  { id: "abai", labelKey: "region.abai", simplifiedRate: 0.04 },
  { id: "zhetysu", labelKey: "region.zhetysu", simplifiedRate: 0.04 },
  { id: "ulytau", labelKey: "region.ulytau", simplifiedRate: 0.04 },
];

export function getRegionRate(regionId: string): number {
  return REGIONS.find((r) => r.id === regionId)?.simplifiedRate ?? 0.04;
}
