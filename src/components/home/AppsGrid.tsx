"use client";

import { AppCard } from "@/components/home/AppCard";
import { useCatalog } from "@/contexts/CatalogContext";
import { shouldHideDevOnlyApps } from "@/lib/admin/runtime";

export function AppsGrid() {
  const { visibleApps, isAdmin, hiddenIds, host } = useCatalog();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
      {visibleApps.map((app) => (
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
