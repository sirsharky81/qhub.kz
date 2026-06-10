"use client";

import { useEffect } from "react";

export function usePWA() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await registration.update();
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    void registerServiceWorker();

    const updateInterval = window.setInterval(() => {
      void navigator.serviceWorker.getRegistration("/sw.js").then((registration) => {
        void registration?.update();
      });
    }, 30 * 60 * 1000);

    return () => {
      window.clearInterval(updateInterval);
    };
  }, []);
}
