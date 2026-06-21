import { apps, sortApps, type App } from "@/data/apps";
import { getHiddenAppIds } from "./store";
import { isAdminAuthenticated } from "./session";
import { isAppVisibleToViewer } from "./visibility";

export { isAppVisibleToViewer } from "./visibility";

export async function getCatalogForViewer(host: string | null | undefined): Promise<{
  apps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
}> {
  const isAdmin = await isAdminAuthenticated();
  const hiddenIds = await getHiddenAppIds();
  const hiddenSet = new Set(hiddenIds);
  const visible = sortApps(apps).filter((app) =>
    isAppVisibleToViewer(app, hiddenSet, isAdmin, host),
  );
  return { apps: visible, isAdmin, hiddenIds };
}
