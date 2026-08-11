"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SendExpiryPreset } from "@/lib/send/constants";
import type { SendTransferPublicMeta } from "@/lib/send/types";

const EXPIRY_OPTIONS: { id: SendExpiryPreset; label: string }[] = [
  { id: "1h", label: "1 час" },
  { id: "1d", label: "1 день" },
  { id: "7d", label: "7 дней" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatExpiry(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SendHomeClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [expiry, setExpiry] = useState<SendExpiryPreset>("1d");
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    shareId: string;
    filename: string;
    sizeBytes: number;
    expiresAt: number;
    hasPassword: boolean;
    oneTime: boolean;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mine, setMine] = useState<SendTransferPublicMeta[]>([]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/send/status");
      const data = (await res.json()) as {
        allowed?: boolean;
        configured?: boolean;
        loggedIn?: boolean;
      };
      setAllowed(Boolean(data.allowed));
      setConfigured(Boolean(data.configured));
      setLoggedIn(Boolean(data.loggedIn));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/send/mine");
      if (!res.ok) return;
      const data = (await res.json()) as { transfers?: SendTransferPublicMeta[] };
      setMine(Array.isArray(data.transfers) ? data.transfers : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (allowed) void loadMine();
  }, [allowed, loadMine]);

  useEffect(() => {
    if (!result?.url) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(result.url, { width: 220, margin: 2 }).then(setQrDataUrl);
  }, [result?.url]);

  const onPickFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    setFiles(Array.from(list));
    setError(null);
    setResult(null);
  };

  const onUpload = async () => {
    if (files.length === 0) {
      setError("Выберите файлы");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.set("expiry", expiry);
      if (password.trim()) form.set("password", password.trim());
      if (oneTime) form.set("oneTime", "1");

      const res = await fetch("/api/send/create", { method: "POST", body: form });
      const data = (await res.json()) as {
        error?: string;
        url?: string;
        shareId?: string;
        filename?: string;
        sizeBytes?: number;
        expiresAt?: number;
        hasPassword?: boolean;
        oneTime?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");

      setResult({
        url: data.url!,
        shareId: data.shareId!,
        filename: data.filename!,
        sizeBytes: data.sizeBytes!,
        expiresAt: data.expiresAt!,
        hasPassword: Boolean(data.hasPassword),
        oneTime: Boolean(data.oneTime),
      });
      setFiles([]);
      setPassword("");
      setOneTime(false);
      void loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!result?.url) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async (shareId: string) => {
    const res = await fetch(`/api/send/${shareId}`, { method: "DELETE" });
    if (res.ok) void loadMine();
  };

  if (statusLoading) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-500">Загрузка…</p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-md text-center space-y-3">
          <p className="text-4xl">📨</p>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">QHub Send</h1>
          <p className="text-sm text-gray-500">Сервис ещё не настроен на сервере.</p>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            На главную
          </Link>
        </div>
      </main>
    );
  }

  if (!loggedIn || !allowed) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4 shadow-sm">
          <div className="text-center">
            <p className="text-4xl mb-2">📨</p>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">QHub Send</h1>
            <p className="text-sm text-gray-500 mt-2">
              {!loggedIn
                ? "Войдите в мессенджер QHub, чтобы отправлять файлы."
                : "Доступ по приглашению. Попросите администратора включить Send для вашего номера."}
            </p>
          </div>
          {!loggedIn && (
            <Link
              href="/tools/messenger/login?next=/send"
              className="block w-full text-center rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700"
            >
              Войти в мессенджер
            </Link>
          )}
          <Link href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700">
            На главную
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="text-center space-y-1">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            QHub
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">QHub Send</h1>
          <p className="text-sm text-gray-500">Файл на NAS → короткая ссылка для получателя</p>
        </header>

        {!result ? (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4 shadow-sm">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPickFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {files.length > 0
                  ? `${files.length} файл(ов) · ${formatBytes(files.reduce((s, f) => s + f.size, 0))}`
                  : "Перетащите файлы или нажмите для выбора"}
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Срок хранения</p>
              <div className="flex gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExpiry(opt.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      expiry === opt.id
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Пароль (необязательно)</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Для получателя"
                autoComplete="new-password"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={oneTime}
                onChange={(e) => setOneTime(e.target.checked)}
                className="rounded"
              />
              Одноразовая ссылка (удалить после скачивания)
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={busy || files.length === 0}
              onClick={() => void onUpload()}
              className="w-full rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Загрузка…" : "Получить ссылку"}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900 p-5 space-y-4 shadow-sm">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ссылка готова</p>
            <p className="text-xs text-gray-500 break-all">{result.url}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {copied ? "Скопировано" : "Копировать"}
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-1 rounded-lg bg-indigo-600 text-white py-2 text-sm font-medium hover:bg-indigo-700"
              >
                Ещё файл
              </button>
            </div>
            {qrDataUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR-код ссылки" className="rounded-lg border border-gray-100" />
              </div>
            )}
            <ul className="text-xs text-gray-500 space-y-1">
              <li>
                {result.filename} · {formatBytes(result.sizeBytes)}
              </li>
              <li>До {formatExpiry(result.expiresAt)}</li>
              {result.hasPassword && <li>Защищено паролем</li>}
              {result.oneTime && <li>Одноразовая ссылка</li>}
            </ul>
          </section>
        )}

        {mine.length > 0 && (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Активные ссылки</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {mine.map((t) => (
                <li key={t.shareId} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.filename}</p>
                    <p className="text-xs text-gray-400">
                      /s/{t.shareId} · до {formatExpiry(t.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(t.shareId)}
                    className="text-xs text-red-600 shrink-0 hover:underline"
                  >
                    Отозвать
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-gray-400">
          Получателю не нужен аккаунт — только ссылка
          {password.trim() ? " и пароль" : ""}.
        </p>
      </div>
    </main>
  );
}
