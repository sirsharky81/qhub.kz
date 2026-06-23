"use client";

import { AppCard } from "@/components/home/AppCard";
import { useCatalog } from "@/contexts/CatalogContext";
import { useMessengerAccess } from "@/hooks/useMessengerAccess";
import { shouldHideDevOnlyApps } from "@/lib/admin/runtime";

export function AppsGrid() {
  const { visibleApps, isAdmin, hiddenIds, host } = useCatalog();
  const { messengerLoggedIn, loaded: messengerLoaded } = useMessengerAccess();

  const filteredApps = visibleApps.filter((app) => {
    if (app.whitelistOnly) {
      if (!messengerLoaded) return false;
      return messengerLoggedIn;
    }
    return true;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
      {filteredApps.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          showPin
          adminHiddenBadge={
            isAdmin &&
            (hiddenIds.has(app.id) || (!!app.devOnly && shouldHideDevOnlyApps(host)))
          }
          adminHiddenBadgeLabel={
            hiddenIds.has(app.id)
              ? "скрыто"
              : app.devOnly && shouldHideDevOnlyApps(host)
                ? "только dev"
                : undefined
          }
        />
      ))}
    </div>
  );
}
