"use client";

import { useCallback, useEffect, useState } from "react";
import { maskPhone } from "@/lib/messenger/phone-format";
import type { SubaruCodingWhitelistEntry } from "@/lib/subaru-coding/access";

export function SubaruCodingWhitelistSection() {
  const [entries, setEntries] = useState<SubaruCodingWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subaru-coding/whitelist", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { entries?: SubaruCodingWhitelistEntry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setError("Не удалось загрузить список доступа Subaru Coding");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/subaru-coding/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, note }),
    });
    const data = (await res.json()) as { error?: string; entry?: SubaruCodingWhitelistEntry };
    if (!res.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setPhone("");
    setNote("");
    setMsg(`Номер ${data.entry ? maskPhone(data.entry.phone) : ""} допущен к Subaru Coding`);
    await load();
  }

  async function setStatus(entryPhone: string, status: "active" | "blocked") {
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/subaru-coding/whitelist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone, status }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setMsg(status === "active" ? "Доступ включён" : "Доступ заблокирован");
    await load();
  }

  async function handleDelete(entryPhone: string) {
    if (!window.confirm(`Убрать ${maskPhone(entryPhone)} из доступа к Subaru Coding?`)) return;
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/subaru-coding/whitelist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setMsg(`Номер ${maskPhone(entryPhone)} удалён`);
    await load();
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Доступ к Subaru Coding по номеру</h2>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          В сервис входит только номер из этого списка со статусом «допущен». Вход в мессенджер сам по себе
          доступ не открывает. Пустой список закрывает сервис для всех. Комната клиента по коду остаётся без
          телефона мастера.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      ) : null}

      <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-gray-600">
          Телефон
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 707 123 45 67"
            inputMode="tel"
            autoComplete="tel"
            required
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="flex-1 text-xs text-gray-600">
          Заметка
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Мастер, город"
            maxLength={120}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Добавить
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-amber-800">Список пуст — войти в Subaru Coding сейчас нельзя никому.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {entries.map((entry) => (
            <li key={entry.phone} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold text-gray-900">{maskPhone(entry.phone)}</p>
                <p className="truncate text-xs text-gray-500">
                  {entry.note || "без заметки"} · {entry.status === "active" ? "допущен" : "заблокирован"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => void setStatus(entry.phone, "blocked")}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    Заблокировать
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setStatus(entry.phone, "active")}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900"
                  >
                    Допустить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.phone)}
                  className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
