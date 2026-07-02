"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CALL_CONNECT_POLL_INTERVAL_MS } from "@/lib/messenger/constants";
import { getCallController } from "@/lib/messenger/call/call-controller";
import { primeCallSounds } from "@/lib/messenger/call/call-sounds";
import { pollIncomingCall } from "@/lib/messenger/call/signaling-client";

function MessengerGlobalCallWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const controller = getCallController();
      if (controller.isInCall()) return;

      const data = await pollIncomingCall();
      if (!data?.incoming || !data.callId || !data.callerPhone || cancelled) return;

      const target = `/tools/messenger/chat?peer=${encodeURIComponent(data.callerPhone)}&call=${encodeURIComponent(data.callId)}`;
      if (pathname?.startsWith("/tools/messenger/chat")) {
        return;
      }

      router.push(target);
    };

    void tick();
    const timer = setInterval(() => void tick(), CALL_CONNECT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}

export function MessengerCallBootstrap() {
  useEffect(() => {
    const prime = () => primeCallSounds();
    document.addEventListener("touchstart", prime, { once: true, passive: true });
    document.addEventListener("click", prime, { once: true });
    return () => {
      document.removeEventListener("touchstart", prime);
      document.removeEventListener("click", prime);
    };
  }, []);

  return <MessengerGlobalCallWatcher />;
}
