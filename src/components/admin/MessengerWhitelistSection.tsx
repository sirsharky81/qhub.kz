"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhitelistEntry } from "@/lib/messenger/types";
import { maskPhone } from "@/lib/messenger/phone-format";

const MESSENGER_ENTRY_PATH = "/tools/messenger";
const VPN_ENTRY_PATH = "/tools/vpn";

function messengerInviteUrl(): string {
  if (typeof window === "undefined") return `https://qhub.kz${MESSENGER_ENTRY_PATH}`;
  return `${window.location.origin}${MESSENGER_ENTRY_PATH}`;
}

export function MessengerWhitelistSection() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState(`https://qhub.kz${MESSENGER_ENTRY_PATH}`);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/messenger/whitelist");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { entries?: WhitelistEntry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setError("Не удалось загрузить whitelist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInviteUrl(messengerInviteUrl());
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/messenger/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json()) as { error?: string; entry?: WhitelistEntry };
    if (!res.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setPhone("");
    setMsg(`Номер ${data.entry ? maskPhone(data.entry.phone) : ""} добавлен`);
    if (data.entry) {
      setEntries((prev) => [data.entry!, ...prev.filter((e) => e.phone !== data.entry!.phone)]);
    }
    await load();
  }

  async function setStatus(entryPhone: string, status: "active" | "revoked") {
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/messenger/whitelist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone, status }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка");
      return;
    }
    await load();
  }

  async function setVpnEnabled(entryPhone: string, vpnEnabled: boolean) {
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/messenger/whitelist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone, vpnEnabled }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка");
      return;
    }
    setMsg(vpnEnabled ? "VPN включён" : "VPN отключён");
    await load();
  }

  async function handleCopyVpnLink() {
    setMsg(null);
    setError(null);
    try {
      const url =
        typeof window === "undefined"
          ? `https://qhub.kz${VPN_ENTRY_PATH}`
          : `${window.location.origin}${VPN_ENTRY_PATH}`;
      await navigator.clipboard.writeText(url);
      setMsg("Ссылка на VPN скопирована");
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }
  async function handleResetPin(entryPhone: string) {
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/messenger/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка");
      return;
    }
    setMsg(`PIN сброшен для ${maskPhone(entryPhone)}`);
  }

  async function handleCreateVpnConfig(entryPhone: string) {
    setMsg(null);
    setError(null);
    const label = window.prompt("Название устройства", "iPhone")?.trim() || "Устройство";
    const res = await fetch("/api/admin/vpn/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: entryPhone, label }),
    });
    const data = (await res.json()) as { error?: string; config?: string; filename?: string };
    if (!res.ok || !data.config) {
      setError(data.error ?? "Не удалось создать конфиг");
      return;
    }
    try {
      await navigator.clipboard.writeText(data.config);
      setMsg(`Конфиг VPN для ${maskPhone(entryPhone)} скопирован в буфер — отправьте родным в мессенджер/Telegram`);
    } catch {
      const blob = new Blob([data.config], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename ?? "qhub-vpn.conf";
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Файл VPN для ${maskPhone(entryPhone)} скачан — отправьте родным`);
    }
  }

  async function handleCopyInviteLink() {
    setMsg(null);
    setError(null);
    try {
      await navigator.clipboard.writeText(messengerInviteUrl());
      setMsg("Ссылка для пользователей скопирована");
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">
          Мессенджер: доступ
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Добавьте номер, затем отправьте пользователю ссылку на вход. Номер в ссылке не передаётся —
          пользователь введёт его сам.
        </p>
        <button
          type="button"
          onClick={() => void handleCopyInviteLink()}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 font-medium hover:bg-sky-100"
        >
          Скопировать ссылку для пользователей
        </button>
        <button
          type="button"
          onClick={() => void handleCopyVpnLink()}
          className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 font-medium hover:bg-violet-100"
        >
          Скопировать ссылку на VPN
        </button>
        <p className="text-[10px] text-gray-400 mt-1.5 font-mono truncate">{inviteUrl.replace(MESSENGER_ENTRY_PATH, VPN_ENTRY_PATH)}</p>
      </div>

      <form onSubmit={handleAdd} className="p-4 flex flex-col sm:flex-row gap-2 border-b border-gray-100">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7XXXXXXXXXX"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm"
          style={{ fontSize: "16px" }}
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="done"
          required
        />
        <button
          type="submit"
          className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold shrink-0"
        >
          Добавить
        </button>
      </form>

      {error && (
        <p className="mx-4 mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {msg && (
        <p className="mx-4 mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {msg}
        </p>
      )}

      {loading ? (
        <p className="p-4 text-sm text-gray-500">Загрузка…</p>
      ) : entries.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">Список пуст</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <li
              key={entry.phone}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{maskPhone(entry.phone)}</p>
                <p className="text-xs text-gray-400">
                  {entry.status === "active" ? "активен" : "отозван"} ·{" "}
                  {entry.vpnEnabled ? "VPN ✓" : "VPN —"} ·{" "}
                  {new Date(entry.addedAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {entry.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => setStatus(entry.phone, "revoked")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Отозвать
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus(entry.phone, "active")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Активировать
                  </button>
                )}
                {entry.status === "active" && (
                  <button
                    type="button"
                    onClick={() => setVpnEnabled(entry.phone, !entry.vpnEnabled)}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                      entry.vpnEnabled
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {entry.vpnEnabled ? "VPN вкл." : "VPN выкл."}
                  </button>
                )}
                {entry.status === "active" && entry.vpnEnabled && (
                  <button
                    type="button"
                    onClick={() => void handleCreateVpnConfig(entry.phone)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-800 hover:bg-violet-50"
                  >
                    Конфиг VPN
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleResetPin(entry.phone)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50"
                >
                  Сбросить PIN
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
