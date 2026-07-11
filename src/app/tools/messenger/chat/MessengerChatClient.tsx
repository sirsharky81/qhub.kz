"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChatView } from "../components/ChatView";
import { CallProvider } from "../components/call/CallProvider";
import { DmWaitingView } from "../components/DmWaitingView";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, fetchPeerPublicKey, fetchProfilesInfoMap } from "@/lib/messenger/client";
import { deriveDmAesKey, getOrCreateDeviceKeyPair } from "@/lib/messenger/crypto";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import {
  checkPeerIdentity,
  fingerprintPublicKeyJwk,
  shortFingerprint,
  trustPeerIdentity,
} from "@/lib/messenger/identity";
import { deriveDmChatId, maskPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { onAppResume } from "@/lib/platform/app-resume";

type Phase = "loading" | "waiting" | "ready" | "auth_error";

const PEER_POLL_VISIBLE_MS = 3000;
const PEER_POLL_HIDDEN_MS = 12000;
const FIRST_CONNECT_BUDGET_MS = 1800;

function withBudget<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function safeFamilyReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("/tools/family") ? raw : null;
}

function MessengerChatInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const peerPhone = normalizeKzPhone(decodeURIComponent(searchParams.get("peer") ?? ""));
  const [myPhone, setMyPhone] = useState("");
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [checking, setChecking] = useState(false);
  const [profileLabels, setProfileLabels] = useState<Record<string, string>>({});
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [identityAlert, setIdentityAlert] = useState<{
    previousFingerprint: string | null;
    currentFingerprint: string;
  } | null>(null);
  const [currentPeerFingerprint, setCurrentPeerFingerprint] = useState<string | null>(null);
  const pairRef = useRef<CryptoKeyPair | null>(null);
  const connectInFlightRef = useRef<Promise<boolean> | null>(null);

  const tryConnectPeer = useCallback(
    async (me: string): Promise<boolean> => {
      const pair = pairRef.current ?? (await getOrCreateDeviceKeyPair());
      pairRef.current = pair;

      const peerPub = await fetchPeerPublicKey(peerPhone);
      if (!peerPub) return false;
      const fingerprint = await fingerprintPublicKeyJwk(peerPub);
      setCurrentPeerFingerprint(fingerprint);
      const identity = checkPeerIdentity(peerPhone, fingerprint);
      if (identity.status === "changed") {
        setIdentityAlert({
          previousFingerprint: identity.previousFingerprint,
          currentFingerprint: fingerprint,
        });
      } else {
        setIdentityAlert(null);
      }

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
      void fetchProfilesInfoMap()
        .then((profiles) => {
          const labels: Record<string, string> = {};
          for (const [phone, info] of Object.entries(profiles)) {
            labels[phone] = info.label;
          }
          setProfileLabels(labels);
          const enriched = profiles[peerPhone];
          if (!enriched) return;
          setPeerAvatarUrl(enriched.avatarUrl);
          upsertLocalDialog({
            id: chatId,
            kind: "dm",
            title: enriched.label,
            peerPhone,
            displayName: enriched.label,
            avatarUrl: enriched.avatarUrl,
            createdAt: Date.now(),
          });
        })
        .catch(() => {});
      return true;
    },
    [peerPhone],
  );

  const connectPeerOnce = useCallback(
    (me: string) => {
      const running = connectInFlightRef.current;
      if (running) return running;
      const next = tryConnectPeer(me).finally(() => {
        if (connectInFlightRef.current === next) {
          connectInFlightRef.current = null;
        }
      });
      connectInFlightRef.current = next;
      return next;
    },
    [tryConnectPeer],
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

      try {
        // Do not block first open on network-bound key publishing.
        void ensureDeviceKeyPublished().catch(() => {});
        pairRef.current = await getOrCreateDeviceKeyPair();
        const connected = await withBudget(connectPeerOnce(me), FIRST_CONNECT_BUDGET_MS, false);
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
        await connectPeerOnce(myPhone);
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
      if (!cancelled) void connectPeerOnce(myPhone);
    });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      removeResume();
    };
  }, [phase, myPhone, connectPeerOnce]);

  const handleCheckNow = useCallback(async () => {
    if (!myPhone || checking) return;
    setChecking(true);
    try {
      await connectPeerOnce(myPhone);
    } finally {
      setChecking(false);
    }
  }, [myPhone, checking, connectPeerOnce]);

  const peerTitle = profileLabels[peerPhone] ?? maskPhone(peerPhone);
  const deepLinkCallId = searchParams.get("call");
  const draftTextRaw = searchParams.get("draft");
  const draftText = draftTextRaw ?? "";
  const backHref = safeFamilyReturnTo(searchParams.get("returnTo")) ?? "/tools/messenger/home";

  const handleTrustIdentity = useCallback(() => {
    if (!currentPeerFingerprint) return;
    trustPeerIdentity(peerPhone, currentPeerFingerprint);
    setIdentityAlert(null);
  }, [currentPeerFingerprint, peerPhone]);

  if (phase === "auth_error") {
    return (
      <MessengerShell variant="chat" title={peerTitle} backHref={backHref}>
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
      <MessengerShell variant="chat" title={peerTitle} backHref={backHref}>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Подготовка защищённого канала…
        </div>
      </MessengerShell>
    );
  }

  const channel = deriveDmChatId(myPhone, peerPhone);

  return (
    <CallProvider
      myPhone={myPhone}
      peerPhone={peerPhone}
      channel={channel}
      peerTitle={peerTitle}
      peerAvatarUrl={peerAvatarUrl}
      deepLinkCallId={deepLinkCallId}
    >
      <ChatView
        channel={channel}
        title={peerTitle}
        backHref={backHref}
        myPhone={myPhone}
        aesKey={aesKey}
        avatarUrl={peerAvatarUrl}
        profileLabels={profileLabels}
        identityAlert={
          identityAlert
            ? {
                previousShort: identityAlert.previousFingerprint
                  ? shortFingerprint(identityAlert.previousFingerprint)
                  : null,
                currentShort: shortFingerprint(identityAlert.currentFingerprint),
              }
            : undefined
        }
        onTrustIdentity={identityAlert ? () => handleTrustIdentity() : undefined}
        initialDraftText={draftText}
      />
    </CallProvider>
  );
}

export function MessengerChatClient() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">Загрузка…</div>}>
      <MessengerChatInner />
    </Suspense>
  );
}
