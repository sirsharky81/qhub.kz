"use client";

import { useEffect, useRef } from "react";
import { submitChildLocation } from "@/lib/family/child-location";
import { handleFamilyLocatePush } from "@/lib/family/location-request-handler";
import { CHILD_SHARE_WITH_PARENTS_KEY } from "@/lib/family/constants";
import {
  isChildShareWithParentsEnabled,
  loadChildSession,
} from "@/lib/family/session";
import { PlatformLocation } from "@/lib/platform/location";
import { PlatformNotifications } from "@/lib/platform/notifications";
import { isNativePlatform } from "@/lib/platform/runtime";

/** Keeps child GPS + family push active anywhere in QHub, not only on /tools/family/child. */
export function FamilyChildBackgroundSync() {
  const stopTrackingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const session = loadChildSession();
    if (!session) return;

    void (async () => {
      const perm = await PlatformNotifications.requestPermission();
      if (perm === "granted") {
        await PlatformNotifications.subscribe("family", session);
      }
    })();

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string; requestId?: string } | null;
      if (!data || data.type !== "qhub:family-locate") return;
      void handleFamilyLocatePush({ action: data.action, requestId: data.requestId });
    };

    const onNativeLocate = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; requestId?: string }>).detail;
      void handleFamilyLocatePush(detail ?? {});
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }
    window.addEventListener("qhub-family-locate-native", onNativeLocate);

    const startTracking = () => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
      if (!isChildShareWithParentsEnabled()) return;

      const onLocation = (pos: { lat: number; lng: number; accuracy: number }) => {
        void submitChildLocation(pos).catch(() => {});
      };

      if (!isNativePlatform()) return;

      void PlatformLocation.startBackgroundTracking({
        onLocation,
        onError: () => {},
      });
      stopTrackingRef.current = () => {
        void PlatformLocation.stopBackgroundTracking();
      };
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CHILD_SHARE_WITH_PARENTS_KEY) {
        startTracking();
      }
    };

    const onShareChange = () => startTracking();

    startTracking();
    window.addEventListener("storage", onStorage);
    window.addEventListener("qhub:family-child-share", onShareChange);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
      window.removeEventListener("qhub-family-locate-native", onNativeLocate);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("qhub:family-child-share", onShareChange);
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
    };
  }, []);

  return null;
}
