"use client";

import { parentRoomUrl } from "@/lib/app-routes";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FamilyShell } from "../../components/FamilyShell";
import { MemberTypeSelect } from "../../components/MemberTypeSelect";
import { adoptChildApi, parseParentScanUrl } from "@/lib/family/client";
import type { FamilyMemberType } from "@/lib/family/member-types";
import { consumeScanResult } from "@/lib/code-scanner/scan-return";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import { loadParentSession } from "@/lib/family/session";

export function ParentScanClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [childName, setChildName] = useState("");
  const [memberType, setMemberType] = useState<FamilyMemberType>("child");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const scanKey = searchParams.get("scanKey");
    if (scanKey) {
      const raw = consumeScanResult(scanKey);
      if (raw) {
        const parsed = parseParentScanUrl(raw);
        if (parsed.token) setToken(parsed.token);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  async function handleAdopt() {
    const session = loadParentSession();
    if (!session) {
      router.replace("/tools/family/parent");
      return;
    }
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Введите или отсканируйте QR ребёнка");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await adoptChildApi(session, trimmed, childName || undefined, memberType);
      setSuccess(`${result.childName} добавлен в семью`);
      setTimeout(() => {
        router.replace(parentRoomUrl(session.roomId));
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  }

  const scanHref = `${CODE_SCANNER_SIMPLE_URL}?returnTo=${encodeURIComponent("/tools/family/parent/scan")}`;
  const session = loadParentSession();
  const backHref = session ? parentRoomUrl(session.roomId) : "/tools/family/parent";

  return (
    <FamilyShell title="Добавить участника" subtitle="Сканируйте QR с устройства участника" backHref={backHref}>
      <div className="p-3 space-y-3">
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Попросите участника открыть приложение и показать QR. Отсканируйте его здесь.
        </p>
        <Link href={scanHref} className="block text-center text-[11px] text-sky-600 underline">
          Открыть сканер QR
        </Link>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Токен из QR"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono"
        />
        <input
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          placeholder="Имя участника (необязательно)"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <MemberTypeSelect value={memberType} onChange={setMemberType} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-emerald-600">{success}</p>}
        <button
          type="button"
          onClick={handleAdopt}
          disabled={loading}
          className="w-full rounded-lg bg-gray-900 text-white py-2 text-xs font-medium disabled:opacity-50"
        >
          {loading ? "Добавление…" : "Добавить в семью"}
        </button>
      </div>
    </FamilyShell>
  );
}
