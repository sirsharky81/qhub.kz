"use client";

import { useCatalog } from "@/contexts/CatalogContext";

export function HomeStats() {
  const { visibleApps } = useCatalog();
  const liveCount = visibleApps.filter((a) => !a.comingSoon).length;
  const comingSoonCount = visibleApps.filter((a) => a.comingSoon).length;

  return (
    <div className="relative mt-16 flex flex-wrap justify-center gap-8 sm:gap-16">
      {[
        {
          value: String(liveCount),
          label: liveCount === 1 ? "Запущенное приложение" : "Запущенных приложения",
        },
        { value: `${comingSoonCount}+`, label: "Скоро на платформе" },
        { value: "100%", label: "Бесплатно" },
      ].map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{s.value}</span>
          <span className="text-xs text-gray-400 text-center max-w-[120px]">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
