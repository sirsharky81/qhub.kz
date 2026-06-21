import type { App } from "@/data/apps";
import { shouldHideDevOnlyApps } from "./runtime";

export function isAppVisibleToViewer(
  app: App,
  hiddenIds: Set<string>,
  isAdmin: boolean,
  host: string | null | undefined,
): boolean {
  if (app.devOnly && shouldHideDevOnlyApps(host) && !isAdmin) return false;
  if (hiddenIds.has(app.id) && !isAdmin) return false;
  return true;
}
