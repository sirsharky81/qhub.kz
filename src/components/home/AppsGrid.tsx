"use client";

import { AppCard } from "@/components/home/AppCard";
import { sortedApps } from "@/data/apps";

export function AppsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
      {sortedApps.map((app) => (
        <AppCard key={app.id} app={app} showPin />
      ))}
    </div>
  );
}
