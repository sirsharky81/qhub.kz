"use client";

import { useEffect } from "react";
import { getMessengerRealtimeClient } from "@/lib/messenger/realtime/client";
import { isMessengerWsEnabled } from "@/lib/messenger/realtime/config";

export function MessengerRealtimeBootstrap() {
  useEffect(() => {
    if (!isMessengerWsEnabled()) return;
    const client = getMessengerRealtimeClient();
    client.start();
    return () => {
      client.stop();
    };
  }, []);

  return null;
}
