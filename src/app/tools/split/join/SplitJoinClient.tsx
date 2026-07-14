"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { apiJoinRoom } from "@/lib/split/client";
import { saveSplitSession } from "@/lib/split/session";
import { SplitShell } from "../components/SplitShell";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [displayName, setDisplayName] = useState("Участник");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      try {
        const session = await apiJoinRoom({ token: token.trim(), displayName });
        saveSplitSession(session);
        router.replace("/tools/split/room");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
      }
    });
  }

  return (
    <div className="p-4 space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-emerald-950/70">Токен приглашения</span>
        <input
          className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-emerald-950/70">Ваше имя</span>
        <input
          className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={pending || !token.trim()}
        onClick={join}
        className="w-full rounded-xl bg-teal-800 text-white py-3 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Входим…" : "Войти в комнату"}
      </button>
    </div>
  );
}

export default function SplitJoinClient() {
  return (
    <SplitShell title="Присоединиться" subtitle="По ссылке или QR" backHref="/tools/split">
      <Suspense fallback={<div className="p-4 text-sm">Загрузка…</div>}>
        <JoinForm />
      </Suspense>
    </SplitShell>
  );
}
