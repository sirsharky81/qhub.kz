"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";
import { MessengerWhitelistSection } from "@/components/admin/MessengerWhitelistSection";

interface AdminAppRow {
  id: string;
  title: string;
  href: string;
  comingSoon: boolean;
  devOnly: boolean;
  hiddenFromPublic: boolean;
}

export function AdminDashboard() {
  const router = useRouter();
  const [apps, setApps] = useState<AdminAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/apps");
      if (res.status === 401) {
        router.push(`/${ADMIN_PANEL_PATH}/login`);
        return;
      }
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { apps: AdminAppRow[] };
      setApps(data.apps);
    } catch {
      setError("Не удалось загрузить список");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  async function toggleHidden(appId: string, hidden: boolean) {
    const res = await fetch("/api/admin/apps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, hidden }),
    });
    if (!res.ok) {
      setError("Не удалось сохранить");
      return;
    }
    setApps((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, hiddenFromPublic: hidden } : a)),
    );
  }

  async function handleLogout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push(`/${ADMIN_PANEL_PATH}/login`);
    router.refresh();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    setPwdLoading(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPwdMsg(data.error ?? "Ошибка");
        return;
      }
      setPwdMsg("Пароль изменён");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setPwdLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Управление карточками</h1>
          <p className="text-sm text-gray-500 mt-1">
            Скрытые карточки не видны на главной. Админ видит все. Удаление недоступно.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Все приложения
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 underline px-2"
          >
            Выйти
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-mono uppercase tracking-wider text-gray-500">
          Приложения на главной
        </div>
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Загрузка…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {apps.map((app) => (
              <li
                key={app.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{app.title}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {app.href}
                    {app.comingSoon ? " · скоро" : ""}
                    {app.devOnly ? " · только dev" : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={app.hiddenFromPublic}
                    onChange={(e) => toggleHidden(app.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Скрыть от пользователей
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MessengerWhitelistSection />

      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Сменить пароль</h2>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
          <input
            type="password"
            placeholder="Текущий пароль"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
            autoComplete="current-password"
            required
          />
          <input
            type="password"
            placeholder="Новый пароль (мин. 8 символов)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="submit"
            disabled={pwdLoading}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {pwdLoading ? "Сохранение…" : "Сохранить пароль"}
          </button>
          {pwdMsg && <p className="text-sm text-gray-600">{pwdMsg}</p>}
        </form>
      </section>
    </div>
  );
}
