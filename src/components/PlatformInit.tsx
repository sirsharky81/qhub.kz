"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/platform/runtime";
import { installMobileViewportGuard } from "@/lib/platform/mobile-viewport";
import { PlatformOfflineQueue } from "@/lib/platform/offlineQueue";
import { FamilyChildBackgroundSync } from "@/components/FamilyChildBackgroundSync";

export function PlatformInit() {
  useEffect(() => {
    installMobileViewportGuard();
    void PlatformOfflineQueue.flush();
    if (!isNativePlatform()) return;
    void import("@/lib/platform/native/push").then((m) => m.initNativePushListeners());
  }, []);

  return <FamilyChildBackgroundSync />;
}
