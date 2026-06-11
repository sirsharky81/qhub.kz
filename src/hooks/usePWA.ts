"use client";

import { useEffect } from "react";

function isLocalhost(): boolean {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

async function unregisterServiceWorkers(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function usePWA() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Service worker caches stale Next.js chunks and breaks client-side navigation in dev.
    if (process.env.NODE_ENV !== "production" || isLocalhost()) {
      void unregisterServiceWorkers();
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await registration.update();
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Service worker registration failed:", error);
        }
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
