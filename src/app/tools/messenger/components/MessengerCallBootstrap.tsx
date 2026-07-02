"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { CALL_DISCOVERY_POLL_INTERVAL_MS } from "@/lib/messenger/constants";
import { getCallController } from "@/lib/messenger/call/call-controller";
import { primeCallSounds } from "@/lib/messenger/call/call-sounds";
import { pollIncomingCall } from "@/lib/messenger/call/signaling-client";
import { normalizeKzPhone } from "@/lib/messenger/phone";

function MessengerGlobalCallWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const controller = getCallController();
      if (controller.isInCall()) return;

      const data = await pollIncomingCall();
      if (!data?.incoming || !data.callId || !data.callerPhone || cancelled) return;

      const target = `/tools/messenger/chat?peer=${encodeURIComponent(data.callerPhone)}&call=${encodeURIComponent(data.callId)}`;
      const caller = normalizeKzPhone(data.callerPhone);
      const deepLinkOpts = {
        channel: data.channel,
        peerPhone: data.callerPhone,
      };

      if (pathname?.startsWith("/tools/messenger/chat")) {
        const peer = searchParams.get("peer");
        if (peer && normalizeKzPhone(peer) === caller) {
          if (controller.getState().phase === "idle") {
            void controller.handleDeepLink(data.callId, deepLinkOpts);
          }
          return;
        }
        router.push(target);
        return;
      }

      router.push(target);
    };

    void tick();
    const timer = setInterval(() => void tick(), CALL_DISCOVERY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname, router, searchParams]);

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

  return (
    <Suspense fallback={null}>
      <MessengerGlobalCallWatcher />
    </Suspense>
  );
}
