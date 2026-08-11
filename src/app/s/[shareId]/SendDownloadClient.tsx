"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SendTransferPublicMeta } from "@/lib/send/types";

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

export function SendDownloadClient() {
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId?.trim() ?? "";

  const [meta, setMeta] = useState<SendTransferPublicMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [downloading, setDownloading] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/send/s/${encodeURIComponent(shareId)}/meta`);
      const data = (await res.json()) as { meta?: SendTransferPublicMeta; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ссылка недоступна");
      setMeta(data.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const download = async () => {
    if (!shareId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/send/s/${encodeURIComponent(shareId)}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; needsPassword?: boolean };
        if (data.needsPassword) {
          setError("Введите пароль");
        } else {
          throw new Error(data.error ?? "Не удалось скачать");
        }
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ? decodeURIComponent(match[1]) : meta?.filename ?? "download";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      if (meta?.oneTime) {
        setError("Файл скачан. Ссылка больше не действует.");
        setMeta(null);
      } else {
        void loadMeta();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4 shadow-sm">
        <div className="text-center">
          <p className="text-4xl mb-2">📨</p>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">QHub Send</h1>
        </div>

        {loading ? (
          <p className="text-sm text-center text-gray-500">Проверка ссылки…</p>
        ) : error && !meta ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <Link href="/" className="text-sm text-indigo-600 hover:underline">
              На главную
            </Link>
          </div>
        ) : meta ? (
          <>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {meta.filename}
              </p>
              <p className="text-xs text-gray-500">
                {formatBytes(meta.sizeBytes)} · действует до {formatExpiry(meta.expiresAt)}
              </p>
              {meta.oneTime && (
                <p className="text-xs text-amber-600">Одноразовая ссылка — после скачивания удалится</p>
              )}
            </div>

            {meta.hasPassword && (
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  autoComplete="current-password"
                />
              </label>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={downloading}
              onClick={() => void download()}
              className="w-full rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {downloading ? "Скачивание…" : "Скачать файл"}
            </button>
          </>
        ) : null}

        <p className="text-center text-xs text-gray-400">
          <Link href="/send" className="hover:text-gray-600">
            Отправить свой файл
          </Link>
        </p>
      </div>
    </main>
  );
}
