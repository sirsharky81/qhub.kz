"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { apiCreateRoom } from "@/lib/split/client";
import { SUPPORTED_CURRENCIES } from "@/lib/split/constants";
import { clearSplitSession, loadSplitSession, saveSplitSession } from "@/lib/split/session";
import { SplitShell } from "./components/SplitShell";

export default function SplitHomeClient() {
  const router = useRouter();
  const [name, setName] = useState("Поездка");
  const [ownerName, setOwnerName] = useState("Я");
  const [baseCurrency, setBaseCurrency] = useState("KZT");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const session = loadSplitSession();
    if (session?.roomId) {
      router.replace("/tools/split/room");
    }
  }, [router]);

  function createRoom() {
    setError(null);
    startTransition(async () => {
      try {
        const session = await apiCreateRoom({ name, ownerName, baseCurrency });
        saveSplitSession(session);
        router.push("/tools/split/room");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
      }
    });
  }

  return (
    <SplitShell title="QHub Split" subtitle="Совместные расходы без платёжек" backHref="/">
      <div className="p-4 space-y-5">
        <section className="space-y-3">
          <p className="text-sm text-emerald-950/70 leading-relaxed">
            Создайте комнату, пригласите участников и считайте, кто кому должен. Курсы задаёт
            владелец. После погашения расходы блокируются.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-emerald-950/70">Название</span>
            <input
              className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-emerald-950/70">Ваше имя</span>
            <input
              className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-emerald-950/70">Валюта комнаты</span>
            <select
              className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={createRoom}
            className="w-full rounded-xl bg-teal-800 text-white py-3 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Создаём…" : "Создать комнату"}
          </button>
        </section>

        <div className="text-center text-sm text-emerald-950/60">
          Есть приглашение?{" "}
          <Link href="/tools/split/join" className="underline text-teal-800">
            Войти по ссылке
          </Link>
        </div>

        <button
          type="button"
          className="w-full text-xs text-emerald-950/40 underline"
          onClick={() => {
            clearSplitSession();
            setError(null);
          }}
        >
          Сбросить локальную сессию
        </button>
      </div>
    </SplitShell>
  );
}
