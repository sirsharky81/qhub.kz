"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { messengerChatUrl } from "@/lib/app-routes";
import {
  fetchAccessCheck,
  fetchContacts,
  fetchProfilesInfoMap,
} from "@/lib/messenger/client";
import { deriveDmChatId, normalizeKzPhone } from "@/lib/messenger/phone";
import { maskPhone, peerDisplayLabel } from "@/lib/messenger/phone-format";
import { ChatInfoView } from "../../components/ChatInfoView";
import { MessengerShell } from "../../components/MessengerShell";
import { PinUnlockGate } from "../../components/PinUnlockGate";
import { CallProvider } from "../../components/call/CallProvider";

function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("/tools/messenger/")) return raw;
  if (raw.startsWith("/tools/family")) return raw;
  return null;
}

function MessengerChatInfoInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const peerPhone = useMemo(
    () => normalizeKzPhone(decodeURIComponent(searchParams.get("peer") ?? "")),
    [searchParams],
  );
  const backHref =
    safeReturnTo(searchParams.get("returnTo")) ?? messengerChatUrl(peerPhone);

  const [myPhone, setMyPhone] = useState("");
  const [title, setTitle] = useState(maskPhone(peerPhone));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!peerPhone) {
      router.replace("/tools/messenger/home");
      return;
    }
    let cancelled = false;
    void (async () => {
      const access = await fetchAccessCheck();
      if (!access.messengerLoggedIn || !access.phone) {
        router.replace("/tools/messenger/login");
        return;
      }
      if (cancelled) return;
      setMyPhone(access.phone);
      try {
        const [profiles, contacts] = await Promise.all([
          fetchProfilesInfoMap(),
          fetchContacts(),
        ]);
        const info = profiles[peerPhone];
        if (!cancelled) {
          setTitle(peerDisplayLabel(peerPhone, info?.displayName));
          setAvatarUrl(info?.avatarUrl ?? null);
          setOnline(Boolean(contacts.find((c) => c.phone === peerPhone)?.online));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerPhone, router]);

  if (!peerPhone) return null;

  if (loading || !myPhone) {
    return (
      <MessengerShell variant="app" title="Контакт" backHref={backHref}>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Загрузка…</div>
      </MessengerShell>
    );
  }

  const channel = deriveDmChatId(myPhone, peerPhone);

  return (
    <PinUnlockGate phone={myPhone} maskedPhone={maskPhone(myPhone)} title={title} backHref={backHref}>
      <CallProvider
        myPhone={myPhone}
        peerPhone={peerPhone}
        channel={channel}
        peerTitle={title}
        peerAvatarUrl={avatarUrl}
      >
        <ChatInfoView
          kind="dm"
          title={title}
          subtitle={online ? "в сети" : "не в сети"}
          avatarUrl={avatarUrl}
          channel={channel}
          backHref={backHref}
          phone={peerPhone}
          seed={peerPhone}
        />
      </CallProvider>
    </PinUnlockGate>
  );
}

export function MessengerChatInfoClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <MessengerChatInfoInner />
    </Suspense>
  );
}
