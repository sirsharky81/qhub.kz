"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiCreateRoom } from "@/lib/split/client";
import {
  SPLIT_PRODUCT_NAME,
  SPLIT_PRODUCT_TAGLINE,
  SUPPORTED_CURRENCIES,
} from "@/lib/split/constants";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import {
  clearSplitSession,
  listSplitSessions,
  removeSplitSession,
  saveSplitSession,
} from "@/lib/split/session";
import type { SplitRoomType, SplitSession } from "@/lib/split/types";
import { SplitShell } from "./components/SplitShell";

const inputClass = `w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 outline-none focus:border-teal-700 ${MOBILE_SAFE_INPUT_CLASS}`;

const ROOM_TYPE_OPTIONS: Array<{ value: SplitRoomType; label: string; hint: string }> = [
  {
    value: "individual",
    label: "Отдельные участники",
    hint: "Каждый сам за себя — классический сплит расходов на компанию.",
  },
  {
    value: "own_family",
    label: "Своя семья",
    hint: "Один дом (например, муж и жена) — удобно вести личные расходы без деления.",
  },
  {
    value: "multi_family",
    label: "Несколько семей",
    hint: "Можно сгруппировать участников по семьям и делить общие расходы пропорционально составу семьи.",
  },
];

export default function SplitHomeClient() {
  const router = useRouter();
  const [rooms, setRooms] = useState<SplitSession[]>(() => listSplitSessions());
  const [name, setName] = useState("Поездка");
  const [ownerName, setOwnerName] = useState("Я");
  const [baseCurrency, setBaseCurrency] = useState("KZT");
  const [roomType, setRoomType] = useState<SplitRoomType>("individual");
  const [showCreateForm, setShowCreateForm] = useState(rooms.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createRoom() {
    setError(null);
    startTransition(async () => {
      try {
        const session = await apiCreateRoom({ name, ownerName, baseCurrency, roomType });
        saveSplitSession(session);
        router.push(`/tools/split/room?room=${encodeURIComponent(session.roomId)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
      }
    });
  }

  return (
    <SplitShell title={SPLIT_PRODUCT_NAME} subtitle={SPLIT_PRODUCT_TAGLINE} backHref="/">
      <div className="p-4 space-y-5">
        {rooms.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Мои комнаты
            </h2>
            <ul className="space-y-2">
              {rooms.map((r) => (
                <li
                  key={r.roomId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-emerald-900/10 bg-white/70 px-3 py-2.5"
                >
                  <Link
                    href={`/tools/split/room?room=${encodeURIComponent(r.roomId)}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="text-sm font-medium truncate">{r.roomName || r.roomId}</div>
                    <div className="text-xs text-emerald-950/45 truncate">
                      {r.displayName}
                      {r.baseCurrency ? ` · ${r.baseCurrency}` : ""}
                      {r.role === "owner" ? " · владелец" : ""}
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-rose-700/80 px-1"
                    aria-label="Удалить из списка"
                    onClick={() => {
                      removeSplitSession(r.roomId);
                      setRooms(listSplitSessions());
                    }}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-emerald-950/40">
              «Удалить» убирает комнату только из этого списка на устройстве — данные в комнате не
              удаляются, вернуться можно по ссылке-приглашению.
            </p>
          </section>
        )}

        {!showCreateForm ? (
          <button
            type="button"
            className="w-full rounded-xl border border-teal-800/30 text-teal-800 py-3 text-sm font-medium"
            onClick={() => setShowCreateForm(true)}
          >
            + Создать новую комнату
          </button>
        ) : (
          <section className="space-y-3">
            <p className="text-sm text-emerald-950/70 leading-relaxed">
              Создайте комнату, пригласите участников и считайте, кто кому должен. Курсы задаёт
              владелец. После погашения расходы блокируются.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-emerald-950/70">Название</span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                enterKeyHint="next"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-emerald-950/70">Ваше имя</span>
              <input
                className={inputClass}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                autoComplete="name"
                enterKeyHint="done"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-emerald-950/70">Валюта комнаты</span>
              <select
                className={inputClass}
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
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-emerald-950/70">Тип комнаты</span>
              <div className="space-y-2">
                {ROOM_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`block rounded-xl border px-3 py-2.5 cursor-pointer ${
                      roomType === opt.value
                        ? "border-teal-700 bg-teal-50"
                        : "border-emerald-900/15 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="roomType"
                        className="mt-0.5"
                        checked={roomType === opt.value}
                        onChange={() => setRoomType(opt.value)}
                      />
                      <div>
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-emerald-950/50">{opt.hint}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
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
        )}

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
            setRooms([]);
            setError(null);
          }}
        >
          Сбросить локальную сессию (все комнаты)
        </button>
      </div>
    </SplitShell>
  );
}
