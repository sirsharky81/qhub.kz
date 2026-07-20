import { apps, sortApps, type App } from "@/data/apps";
import { getHiddenAppIds } from "./store";
import { isAdminAuthenticated } from "./session";
import { isAppVisibleToViewer } from "./visibility";
import { canViewerSeeVpnApp } from "@/lib/vpn/visibility";

export { isAppVisibleToViewer } from "./visibility";

export async function getCatalogForViewer(host: string | null | undefined): Promise<{
  apps: App[];
  isAdmin: boolean;
  hiddenIds: string[];
}> {
  const isAdmin = await isAdminAuthenticated();
  const hiddenIds = await getHiddenAppIds();
  const hiddenSet = new Set(hiddenIds);
  const vpnVisible = await canViewerSeeVpnApp(isAdmin);
  const visible = sortApps(apps).filter((app) => {
    if (app.gatedBy === "vpn" && !vpnVisible) return false;
    return isAppVisibleToViewer(app, hiddenSet, isAdmin, host);
  });
  return { apps: visible, isAdmin, hiddenIds };
}
