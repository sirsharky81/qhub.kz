"use client";

import { useEffect } from "react";
import { pingMessengerPresence } from "@/lib/messenger/client";
import { onAppResume } from "@/lib/platform/app-resume";

const PRESENCE_HEARTBEAT_MS = 20_000;

export function MessengerPresenceHeartbeat() {
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const tick = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") {
        void pingMessengerPresence();
      }
      timer = window.setTimeout(tick, PRESENCE_HEARTBEAT_MS);
    };

    void pingMessengerPresence();
    timer = window.setTimeout(tick, PRESENCE_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pingMessengerPresence();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const removeResume = onAppResume(() => void pingMessengerPresence());

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeResume();
    };
  }, []);

  return null;
}
