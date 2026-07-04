"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChatView } from "../components/ChatView";
import { CallProvider } from "../components/call/CallProvider";
import { DmWaitingView } from "../components/DmWaitingView";
import { MessengerShell } from "../components/MessengerShell";
import { PinUnlockGate } from "../components/PinUnlockGate";
import { fetchAccessCheck, fetchPeerPublicKey, fetchProfilesMap } from "@/lib/messenger/client";
import { deriveDmAesKey, getOrCreateDeviceKeyPair } from "@/lib/messenger/crypto";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import { deriveDmChatId, maskPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { onAppResume } from "@/lib/platform/app-resume";

type Phase = "loading" | "waiting" | "ready" | "auth_error";

const PEER_POLL_VISIBLE_MS = 3000;
const PEER_POLL_HIDDEN_MS = 12000;

function MessengerChatInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const peerPhone = normalizeKzPhone(decodeURIComponent(searchParams.get("peer") ?? ""));
  const [myPhone, setMyPhone] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [checking, setChecking] = useState(false);
  const [profileLabels, setProfileLabels] = useState<Record<string, string>>({});
  const pairRef = useRef<CryptoKeyPair | null>(null);

  const tryConnectPeer = useCallback(
    async (me: string): Promise<boolean> => {
      const pair = pairRef.current ?? (await getOrCreateDeviceKeyPair());
      pairRef.current = pair;

      const peerPub = await fetchPeerPublicKey(peerPhone);
      if (!peerPub) return false;

      const key = await deriveDmAesKey(pair.privateKey, peerPub, me, peerPhone);
      const chatId = deriveDmChatId(me, peerPhone);
      const peerLabel = maskPhone(peerPhone);
      upsertLocalDialog({
        id: chatId,
        kind: "dm",
        title: peerLabel,
        peerPhone,
        displayName: undefined,
        createdAt: Date.now(),
      });
      setAesKey(key);
      setPhase("ready");

      // Heavy contacts/profile fetch is best-effort and should not block opening chat.
      void fetchProfilesMap()
        .then((profiles) => {
          setProfileLabels(profiles);
          const enriched = profiles[peerPhone];
          if (!enriched) return;
          upsertLocalDialog({
            id: chatId,
            kind: "dm",
            title: enriched,
            peerPhone,
            displayName: enriched,
            createdAt: Date.now(),
          });
        })
        .catch(() => {});
      return true;
    },
    [peerPhone],
  );

  useEffect(() => {
    if (!peerPhone) {
      router.replace("/tools/messenger/home");
      return;
    }
    let cancelled = false;

    async function init() {
      const access = await fetchAccessCheck();
      if (!access.messengerLoggedIn || !access.phone) {
        router.replace("/tools/messenger/login");
        return;
      }
      if (cancelled) return;

      const me = access.phone;
      setMyPhone(me);
      setMaskedPhone(maskPhone(me));

      try {
        // Do not block first open on network-bound key publishing.
        void ensureDeviceKeyPublished().catch(() => {});
        pairRef.current = await getOrCreateDeviceKeyPair();
        const connected = await tryConnectPeer(me);
        if (connected || cancelled) return;
        if (!cancelled) setPhase("waiting");
      } catch {
        if (!cancelled) setPhase("auth_error");
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [peerPhone, router, tryConnectPeer]);

  useEffect(() => {
    if (phase !== "waiting" || !myPhone) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    async function poll() {
      if (cancelled) return;
      try {
        await tryConnectPeer(myPhone);
      } catch {
        // keep waiting
      }
      if (!cancelled) {
        const ms = document.hidden ? PEER_POLL_HIDDEN_MS : PEER_POLL_VISIBLE_MS;
        timeoutId = window.setTimeout(() => void poll(), ms);
      }
    }

    void poll();
    const removeResume = onAppResume(() => {
      if (!cancelled) void tryConnectPeer(myPhone);
    });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      removeResume();
    };
  }, [phase, myPhone, tryConnectPeer]);

  const handleCheckNow = useCallback(async () => {
    if (!myPhone || checking) return;
    setChecking(true);
    try {
      await tryConnectPeer(myPhone);
    } finally {
      setChecking(false);
    }
  }, [myPhone, checking, tryConnectPeer]);

  const peerTitle = profileLabels[peerPhone] ?? maskPhone(peerPhone);
  const deepLinkCallId = searchParams.get("call");

  if (phase === "auth_error") {
    return (
      <MessengerShell variant="chat" title={peerTitle} backHref="/tools/messenger/home">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-red-600">Не удалось подготовить защищённый канал.</p>
          <a
            href="/tools/messenger/home"
            className="rounded-2xl bg-gray-900 text-white px-6 py-2.5 text-sm font-semibold"
          >
            На главную
          </a>
        </div>
      </MessengerShell>
    );
  }

  if (phase === "waiting") {
    return (
      <DmWaitingView peerTitle={peerTitle} checking={checking} onCheckNow={() => void handleCheckNow()} />
    );
  }

  if (phase === "loading" || !aesKey || !myPhone) {
    return (
      <MessengerShell variant="chat" title={peerTitle} backHref="/tools/messenger/home">
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Подготовка защищённого канала…
        </div>
      </MessengerShell>
    );
  }

  const channel = deriveDmChatId(myPhone, peerPhone);

  return (
    <PinUnlockGate phone={myPhone} maskedPhone={maskedPhone} title={peerTitle} backHref="/tools/messenger/home">
      <CallProvider
        myPhone={myPhone}
        peerPhone={peerPhone}
        channel={channel}
        peerTitle={peerTitle}
        deepLinkCallId={deepLinkCallId}
      >
        <ChatView
          channel={channel}
          title={peerTitle}
          backHref="/tools/messenger/home"
          myPhone={myPhone}
          aesKey={aesKey}
          profileLabels={profileLabels}
        />
      </CallProvider>
    </PinUnlockGate>
  );
}

export function MessengerChatClient() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">Загрузка…</div>}>
      <MessengerChatInner />
    </Suspense>
  );
}
