"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IdeaModal({ open, onClose }: Props) {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ idea: "", name: "", contact: "" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSent(false);
      setForm({ idea: "", name: "", contact: "" });
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.idea.trim() || !form.name.trim()) return;

    const subject = encodeURIComponent("Идея для QHub.kz от " + form.name);
    const body = encodeURIComponent(
      `Идея:\n${form.idea}\n\nОт кого: ${form.name}${form.contact ? "\nКонтакт: " + form.contact : ""}`
    );
    window.location.href = `mailto:hello@qhub.kz?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" aria-hidden />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-black/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">
              Светлая голова
            </p>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Предложить идею
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 -mr-1 rounded-md"
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M14 4L4 14M4 4l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {sent ? (
          /* Success state */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xl">
              ✓
            </div>
            <p className="font-semibold text-gray-900">Открывается почтовый клиент</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              Письмо уже заполнено. Просто отправьте его — и мы свяжемся с вами.
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

            {/* Idea textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">
                Идея или предложение <span className="text-gray-400">*</span>
              </label>
              <textarea
                ref={textareaRef}
                required
                rows={4}
                value={form.idea}
                onChange={(e) => setForm({ ...form, idea: e.target.value })}
                placeholder="Опишите идею: что это, какую задачу решает, кому будет полезно..."
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors leading-relaxed"
              />
            </div>

            {/* Name */}
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
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
              />
            </div>

            {/* Contact (optional) */}
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
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={!form.idea.trim() || !form.name.trim()}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Отправить
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:text-gray-900 hover:bg-gray-50 transition-all"
              >
                Отмена
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Откроется почтовый клиент с заполненным письмом на hello@qhub.kz
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
