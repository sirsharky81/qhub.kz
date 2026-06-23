"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_INSTALL_PROMPT_SHOWN } from "@/lib/admin/constants";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";
import { isStandalone } from "@/lib/pwa-utils";
import { AdminInstallModal } from "./AdminInstallModal";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  function goToPanel() {
    router.push(`/${ADMIN_PANEL_PATH}`);
    router.refresh();
  }

  function maybeShowInstallPrompt() {
    const alreadyShown = localStorage.getItem(ADMIN_INSTALL_PROMPT_SHOWN);
    if (!isStandalone() && !alreadyShown) {
      setShowInstallModal(true);
      return;
    }
    goToPanel();
  }

  function handleInstallContinue() {
    localStorage.setItem(ADMIN_INSTALL_PROMPT_SHOWN, "1");
    setShowInstallModal(false);
    goToPanel();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Ошибка входа");
        return;
      }
      maybeShowInstallPrompt();
    } catch {
      setError("Не удалось выполнить запрос");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AdminInstallModal open={showInstallModal} onContinue={handleInstallContinue} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            required
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">
            Пароль
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            required
          />
        </div>
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Вход…" : "Войти"}
        </button>
      </form>
    </>
  );
}
