"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { CALL_DISCOVERY_POLL_INTERVAL_MS } from "@/lib/messenger/constants";
import { getCallController } from "@/lib/messenger/call/call-controller";
import { primeCallSounds } from "@/lib/messenger/call/call-sounds";
import { pollIncomingCall } from "@/lib/messenger/call/signaling-client";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { getMessengerRealtimeClient } from "@/lib/messenger/realtime/client";
import { platformFetch } from "@/lib/platform/api-client";

async function declineCallFromNotification(callId: string): Promise<void> {
  if (!callId) return;
  try {
    await platformFetch("/api/messenger/call/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, reason: "reject" }),
    });
  } catch {
    /* ignore */
  }
}

function handleIncomingCall(
  data: {
    callId: string;
    callerPhone: string;
    channel?: string;
    media?: "audio" | "video";
  },
  pathname: string | null,
  searchParams: ReturnType<typeof useSearchParams>,
  router: ReturnType<typeof useRouter>,
): void {
  const controller = getCallController();
  if (controller.isInCall()) return;

  const target = `/tools/messenger/chat?peer=${encodeURIComponent(data.callerPhone)}&call=${encodeURIComponent(data.callId)}`;
  const caller = normalizeKzPhone(data.callerPhone);
  const deepLinkOpts = {
    channel: data.channel,
    peerPhone: data.callerPhone,
    media: data.media,
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
}

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
      if (!getMessengerRealtimeClient().shouldUsePollingFallback()) return;

      const data = await pollIncomingCall();
      if (!data?.incoming || !data.callId || !data.callerPhone || cancelled) return;

      handleIncomingCall(
        {
          callId: data.callId,
          callerPhone: data.callerPhone,
          channel: data.channel,
          media: data.media,
        },
        pathname,
        searchParams,
        router,
      );
    };

    void tick();
    const timer = setInterval(() => void tick(), CALL_DISCOVERY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const realtime = getMessengerRealtimeClient();
    return realtime.subscribe((event) => {
      if (event.type !== "incoming_call") return;
      handleIncomingCall(
        {
          callId: event.callId,
          callerPhone: event.callerPhone,
          channel: event.channel,
          media: event.media,
        },
        pathname,
        searchParams,
        router,
      );
    });
  }, [pathname, router, searchParams]);

  return null;
}

export function MessengerCallBootstrap() {
  const router = useRouter();

  useEffect(() => {
    const prime = () => primeCallSounds();
    document.addEventListener("touchstart", prime, { once: true, passive: true });
    document.addEventListener("click", prime, { once: true });
    return () => {
      document.removeEventListener("touchstart", prime);
      document.removeEventListener("click", prime);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; url?: string; callId?: string }>).detail;
      if (!detail?.action) return;

      if (detail.action === "call_decline") {
        void declineCallFromNotification(detail.callId ?? "");
        return;
      }

      if ((detail.action === "call_accept" || detail.action === "open") && detail.url) {
        router.push(detail.url);
      }
    };

    window.addEventListener("qhub-messenger-push-native", handler);
    return () => window.removeEventListener("qhub-messenger-push-native", handler);
  }, [router]);

  return (
    <Suspense fallback={null}>
      <MessengerGlobalCallWatcher />
    </Suspense>
  );
}
