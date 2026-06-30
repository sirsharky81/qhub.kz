"use client";

import { parentRoomUrl } from "@/lib/app-routes";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { FamilyShell } from "../../components/FamilyShell";
import { joinFamilyBindApi } from "@/lib/family/client";
import { consumeScanResult } from "@/lib/code-scanner/scan-return";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import { loadParentSession, saveParentSession } from "@/lib/family/session";

function JoinInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = loadParentSession();
    if (session?.roomId) {
      router.replace(parentRoomUrl(session.roomId));
    }
  }, [router]);

  useEffect(() => {
    const scanKey = searchParams.get("scanKey");
    if (scanKey) {
      const raw = consumeScanResult(scanKey);
      if (raw) {
        try {
          const u = new URL(raw, window.location.origin);
          const t = u.searchParams.get("token");
          if (t) setToken(t);
        } catch {
          setToken(raw);
        }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  async function handleJoin() {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Введите или отсканируйте приглашение");
      return;
    }
    if (!name.trim()) {
      setError("Введите ваше имя");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await joinFamilyBindApi(trimmed, name.trim());
      if (session.role === "tracked") {
        setError("Это приглашение для участника, не для родителя");
        setLoading(false);
        return;
      }
      saveParentSession(session);
      router.replace(parentRoomUrl(session.roomId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  }

  const scanHref = `${CODE_SCANNER_SIMPLE_URL}?returnTo=${encodeURIComponent("/tools/family/parent/join")}`;

  return (
    <FamilyShell title="Присоединиться" subtitle="Второй родитель в семье" backHref="/tools/family">
      <div className="p-3 space-y-3">
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Попросите создателя семьи отправить вам QR или ссылку-приглашение. После присоединения у вас будет
          такой же доступ к карте и участникам, как у создателя.
        </p>
        <label className="block text-xs font-medium text-gray-700">Ваше имя</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как вас называть в семье"
          className={`w-full rounded-lg border border-gray-200 px-3 py-2 ${MOBILE_SAFE_INPUT_CLASS}`}
        />
        <Link href={scanHref} className="block text-center text-[11px] text-sky-600 underline">
          Открыть сканер QR
        </Link>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Код из приглашения"
          className={`w-full rounded-lg border border-gray-200 px-3 py-2 font-mono ${MOBILE_SAFE_INPUT_CLASS}`}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading}
          className="w-full rounded-lg bg-gray-900 text-white py-2 text-xs font-medium disabled:opacity-50"
        >
          {loading ? "Присоединение…" : "Войти в семью"}
        </button>
        <Link href="/tools/family/parent" className="block text-center text-xs text-gray-500 underline">
          Создать свою семью
        </Link>
      </div>
    </FamilyShell>
  );
}

export function ParentJoinClient() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Загрузка…</div>}>
      <JoinInner />
    </Suspense>
  );
}
