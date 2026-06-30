"use client";

import { useEffect, useState } from "react";
import { platformFetch } from "@/lib/platform/api-client";
import { getAppVersion } from "@/lib/platform/device";
import { isNativePlatform } from "@/lib/platform/runtime";

export function VersionGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [softUpdate, setSoftUpdate] = useState(false);

  useEffect(() => {
    void platformFetch("/api/app/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { minimumSupportedVersion?: string; latestVersion?: string } | null) => {
        if (!config || !isNativePlatform()) return;
        const current = getAppVersion();
        if (compareSemver(current, config.minimumSupportedVersion ?? "0.0.0") < 0) {
          setBlocked(true);
        } else if (compareSemver(current, config.latestVersion ?? current) < 0) {
          setSoftUpdate(true);
        }
      })
      .catch(() => {});
  }, []);

  if (blocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white p-6 text-center">
        <h1 className="text-lg font-bold mb-2">Требуется обновление</h1>
        <p className="text-sm text-gray-600 mb-4">
          Установленная версия QHub устарела. Обновите приложение в App Store или Google Play.
        </p>
      </div>
    );
  }

  return (
    <>
      {softUpdate && (
        <div className="fixed top-0 inset-x-0 z-[9998] bg-sky-600 text-white text-xs text-center py-2 px-4">
          Доступна новая версия QHub
        </div>
      )}
      {children}
    </>
  );
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
