"use client";

import { useCatalog } from "@/contexts/CatalogContext";

export function HomeStats() {
  const { visibleApps } = useCatalog();
  const liveCount = visibleApps.filter((a) => !a.comingSoon).length;
  const comingSoonCount = visibleApps.filter((a) => a.comingSoon).length;

  return (
    <div className="relative mt-12 sm:mt-16 w-full max-w-xl mx-auto px-2">
      <div className="grid grid-cols-3 gap-3 sm:gap-10">
        {[
          {
            value: String(liveCount),
            label: liveCount === 1 ? "Запущенное приложение" : "Запущенных приложения",
          },
          { value: `${comingSoonCount}+`, label: "Скоро на платформе" },
          { value: "100%", label: "Бесплатно" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 min-w-0">
            <span className="text-xl sm:text-3xl font-bold tracking-tight text-gray-900 whitespace-nowrap tabular-nums">
              {s.value}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-400 text-center leading-tight px-0.5">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
