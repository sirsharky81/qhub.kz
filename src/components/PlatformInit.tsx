"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/platform/runtime";
import { installMobileViewportGuard } from "@/lib/platform/mobile-viewport";
import { PlatformOfflineQueue } from "@/lib/platform/offlineQueue";

export function PlatformInit() {
  useEffect(() => {
    installMobileViewportGuard();
    if (!isNativePlatform()) return;
    void import("@/lib/platform/native/push").then((m) => m.initNativePushListeners());
    void PlatformOfflineQueue.flush();
  }, []);

  return null;
}
