import type { FamilySession } from "@/lib/family/types";
import { isNativePlatform } from "./runtime";
import { PlatformLogger } from "./logger";

export type NotificationContext = "family" | "messenger";

export const PlatformNotifications = {
  async requestPermission(): Promise<"granted" | "denied"> {
    if (isNativePlatform()) {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const result = await PushNotifications.requestPermissions();
        return result.receive === "granted" ? "granted" : "denied";
      } catch {
        return "denied";
      }
    }
    if (typeof Notification === "undefined") return "denied";
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : "denied";
  },

  async subscribe(
    context: NotificationContext,
    session?: FamilySession,
  ): Promise<boolean> {
    if (isNativePlatform()) {
      try {
        const { registerNativePush } = await import("@/lib/platform/native/push");
        return registerNativePush(context, session);
      } catch (e) {
        PlatformLogger.error("Native push subscribe failed", e instanceof Error ? e : new Error(String(e)));
        return false;
      }
    }

    if (context === "family" && session) {
      const { subscribeFamilyPush } = await import("@/lib/family/push");
      return subscribeFamilyPush(session);
    }
    if (context === "messenger") {
      const { subscribeMessengerPush } = await import("@/lib/messenger/push");
      return subscribeMessengerPush();
    }
    return false;
  },

  onNotificationReceived(_callback: (data: unknown) => void): () => void {
    return () => {};
  },

  onNotificationTapped(_callback: (data: unknown) => void): () => void {
    return () => {};
  },
};
