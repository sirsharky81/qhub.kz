"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DeveloperModal({ open, onClose }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    appName: "",
    description: "",
    name: "",
    contact: "",
    website: "",
  });
  const appNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSent(false);
      setLoading(false);
      setError(null);
      setForm({ appName: "", description: "", name: "", contact: "", website: "" });
      setTimeout(() => appNameRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, loading]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.appName.trim() || !form.description.trim() || !form.name.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/submit-developer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: form.appName.trim(),
          description: form.description.trim(),
          name: form.name.trim(),
          contact: form.contact.trim() || undefined,
          website: form.website,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setError(data?.error ?? "Не удалось отправить. Попробуйте позже.");
        return;
      }

      setSent(true);
    } catch {
      setError("Не удалось отправить. Проверьте соединение и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (!loading && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" aria-hidden />

      <div className="relative w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-black/10 overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">
              Для разработчиков
            </p>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Добавить приложение
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 -mr-1 rounded-md disabled:opacity-40"
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M14 4L4 14M4 4l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xl">
              ✓
            </div>
            <p className="font-semibold text-gray-900">Заявка отправлена</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              Спасибо! Мы рассмотрим ваше приложение и свяжемся с вами.
            </p>
            <button
              onClick={onClose}
              className="mt-2 text-sm px-5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">
                Название приложения <span className="text-gray-400">*</span>
              </label>
              <input
                ref={appNameRef}
                type="text"
                required
                value={form.appName}
                onChange={(e) => setForm({ ...form, appName: e.target.value })}
                placeholder="Как называется ваш проект"
                disabled={loading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">
                Описание и ссылка <span className="text-gray-400">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Что делает приложение, кому полезно, ссылка на демо или репозиторий..."
                disabled={loading}
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors leading-relaxed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">
                Ваше имя <span className="text-gray-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Как к вам обращаться"
                disabled={loading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                Email или телефон
                <span className="text-[10px] font-normal text-gray-400 px-1.5 py-0.5 rounded-md bg-gray-100">
                  необязательно
                </span>
              </label>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="hello@example.com или +7 700 000 0000"
                disabled={loading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors disabled:opacity-60"
              />
            </div>

            <input
              type="text"
              name="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute opacity-0 pointer-events-none h-0 w-0"
            />

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={
                  !form.appName.trim() || !form.description.trim() || !form.name.trim() || loading
                }
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Отправляем…" : "Отправить"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:text-gray-900 hover:bg-gray-50 transition-all disabled:opacity-40"
              >
                Отмена
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Заявка отправится команде QHub напрямую
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
