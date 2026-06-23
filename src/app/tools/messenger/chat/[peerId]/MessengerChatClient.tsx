"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatView } from "../../components/ChatView";
import { DmWaitingView } from "../../components/DmWaitingView";
import { MessengerShell } from "../../components/MessengerShell";
import { fetchAccessCheck, fetchPeerPublicKey } from "@/lib/messenger/client";
import { deriveDmAesKey, getOrCreateDeviceKeyPair } from "@/lib/messenger/crypto";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import { deriveDmChatId, maskPhone, normalizeKzPhone } from "@/lib/messenger/phone";

type Phase = "loading" | "waiting" | "ready" | "auth_error";

const PEER_POLL_MS = 3000;

export function MessengerChatClient() {
  const params = useParams();
  const router = useRouter();
  const peerPhone = normalizeKzPhone(decodeURIComponent(String(params.peerId ?? "")));
  const [myPhone, setMyPhone] = useState("");
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [checking, setChecking] = useState(false);
  const pairRef = useRef<CryptoKeyPair | null>(null);

  const tryConnectPeer = useCallback(
    async (me: string): Promise<boolean> => {
      const pair = pairRef.current ?? (await getOrCreateDeviceKeyPair());
      pairRef.current = pair;

      const peerPub = await fetchPeerPublicKey(peerPhone);
      if (!peerPub) return false;

      const key = await deriveDmAesKey(pair.privateKey, peerPub, me, peerPhone);
      const chatId = deriveDmChatId(me, peerPhone);
      upsertLocalDialog({
        id: chatId,
        kind: "dm",
        title: maskPhone(peerPhone),
        peerPhone,
        createdAt: Date.now(),
      });
      setAesKey(key);
      setPhase("ready");
      return true;
    },
    [peerPhone],
  );

  useEffect(() => {
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

      try {
        await ensureDeviceKeyPublished();
        pairRef.current = await getOrCreateDeviceKeyPair();

        for (let i = 0; i < 3 && !cancelled; i++) {
          const connected = await tryConnectPeer(me);
          if (connected || cancelled) return;
          if (i < 2) await new Promise((r) => setTimeout(r, 1000));
        }

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

    async function poll() {
      if (document.hidden || cancelled) return;
      try {
        await tryConnectPeer(myPhone);
      } catch {
        // keep waiting
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), PEER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
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

  const peerTitle = maskPhone(peerPhone);

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
    <ChatView
      channel={channel}
      title={peerTitle}
      backHref="/tools/messenger/home"
      myPhone={myPhone}
      aesKey={aesKey}
    />
  );
}
