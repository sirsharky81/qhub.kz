"use client";

import { messengerRoomUrl } from "@/lib/app-routes";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { MessengerShell } from "../../components/MessengerShell";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import { joinRoomApi } from "@/lib/messenger/client";
import { importRoomKeyBase64Url, parseRoomJoinUrl } from "@/lib/messenger/crypto";
import { setRoomKey, getRoomKey } from "@/lib/messenger/room-keys";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import { consumeScanResult } from "@/lib/code-scanner/scan-return";

function JoinInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [myPhone, setMyPhone] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const scanKey = searchParams.get("scanKey");
    if (scanKey) {
      const raw = consumeScanResult(scanKey);
      if (raw) {
        const parsed = parseRoomJoinUrl(raw);
        if (parsed.code) setCode(parsed.code.toUpperCase());
        if (parsed.key) setKeyInput(parsed.key);
      }
    }
    if (typeof window !== "undefined" && window.location.hash.startsWith("#key=")) {
      setKeyInput(decodeURIComponent(window.location.hash.slice(5)));
    }
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/messenger/access-check")
      .then((r) => r.json())
      .then((d: { phone?: string; messengerLoggedIn?: boolean }) => {
        if (!d.messengerLoggedIn) router.replace("/tools/messenger/login");
        else setMyPhone(d.phone ?? "");
      });
  }, [router]);

  useEffect(() => {
    if (!myPhone) return;
    const rid = code.trim().toUpperCase();
    if (!rid || joining) return;
    const storedKey = getRoomKey(rid);
    if (storedKey && !keyInput.trim()) {
      router.replace(messengerRoomUrl(rid));
    }
  }, [myPhone, code, keyInput, joining, router]);

  async function handleJoin() {
    setError(null);
    const rid = code.trim().toUpperCase();
    const keyStr = keyInput.trim();
    if (!rid) {
      setError("Введите код комнаты");
      return;
    }
    if (!keyStr) {
      setError("Нужен ключ шифрования. Отсканируйте QR или вставьте ссылку целиком.");
      return;
    }
    setJoining(true);
    try {
      await importRoomKeyBase64Url(keyStr);
      const joined = await joinRoomApi(rid);
      if (!joined.ok) {
        setError(joined.error ?? "Комната не найдена");
        setJoining(false);
        return;
      }
      setRoomKey(rid, keyStr);
      upsertLocalDialog({
        id: `room:${rid}`,
        kind: "room",
        title: `Комната ${rid}`,
        roomId: rid,
        createdAt: Date.now(),
      });
      router.replace(messengerRoomUrl(rid));
    } catch {
      setError("Неверный ключ комнаты");
      setJoining(false);
    }
  }

  const returnTo = encodeURIComponent("/tools/messenger/room/join");
  const scannerHref = `${CODE_SCANNER_SIMPLE_URL}&returnTo=${returnTo}`;

  return (
    <MessengerShell variant="app" title="Присоединиться" backHref="/tools/messenger/home">
      <div className="p-4 w-full space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Код комнаты не содержит ключ шифрования. Попросите отправителя поделиться QR-кодом или
          ссылкой целиком.
        </div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Код комнаты"
          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-mono tracking-widest uppercase"
        />

        <input
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Ключ (из QR или #key=…)"
          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-xs font-mono"
        />

        <Link
          href={scannerHref}
          className="block w-full text-center rounded-2xl border border-gray-200 py-3 text-sm font-semibold"
        >
          Сканировать QR
        </Link>

        <button
          type="button"
          disabled={joining}
          onClick={() => void handleJoin()}
          className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {joining ? "Вход…" : "Войти"}
        </button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </MessengerShell>
  );
}

export function MessengerRoomJoinClient() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Загрузка…</div>}>
      <JoinInner />
    </Suspense>
  );
}
