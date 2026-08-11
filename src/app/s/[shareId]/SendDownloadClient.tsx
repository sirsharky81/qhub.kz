"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { downloadBlobAsync } from "@/lib/platform/save-file";
import type { SendTransferPublicMeta } from "@/lib/send/types";

type DownloadPhase = "idle" | "downloading" | "saving" | "done";

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

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = disposition.match(/filename="([^"]+)"/i) ?? disposition.match(/filename=([^;]+)/i);
  if (plain?.[1]) {
    try {
      return decodeURIComponent(plain[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return plain[1].trim().replace(/^"|"$/g, "");
    }
  }
  return fallback;
}

/** fetch + stream (same path that was fast before XHR); progress from byte chunks. */
async function downloadSendFile(
  shareId: string,
  password: string,
  expectedBytes: number,
  onProgress: (pct: number, loaded: number, total: number) => void,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/send/s/${encodeURIComponent(shareId)}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password.trim() || undefined }),
  });

  if (!res.ok) {
    let message = `Не удалось скачать (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; needsPassword?: boolean };
      if (data.needsPassword) throw new Error("Введите пароль");
      if (data.error) message = data.error;
    } catch (err) {
      if (err instanceof Error && err.message === "Введите пароль") throw err;
    }
    throw new Error(message);
  }

  const filename = parseFilename(
    res.headers.get("Content-Disposition"),
    "download",
  );
  const hintTotal = Number(
    res.headers.get("X-Send-Size") || res.headers.get("Content-Length") || "0",
  );
  const total = hintTotal > 0 ? hintTotal : expectedBytes > 0 ? expectedBytes : 0;

  // Prefer streaming progress; fall back to blob() if body is unavailable.
  if (!res.body) {
    const blob = await res.blob();
    onProgress(100, blob.size, blob.size || total);
    return { blob, filename };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    chunks.push(value);
    loaded += value.byteLength;
    if (total > 0) {
      onProgress(Math.min(99, Math.round((loaded / total) * 100)), loaded, total);
    } else {
      onProgress(0, loaded, 0);
    }
  }

  const contentType = res.headers.get("Content-Type") || undefined;
  const blob = new Blob(chunks as BlobPart[], { type: contentType });
  onProgress(100, loaded, loaded || total);
  return { blob, filename };
}

export function SendDownloadClient() {
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId?.trim() ?? "";

  const [meta, setMeta] = useState<SendTransferPublicMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  const busy = phase === "downloading" || phase === "saving";

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
    setPhase("downloading");
    setProgress(0);
    setLoadedBytes(0);
    setTotalBytes(meta?.sizeBytes ?? 0);
    setError(null);
    setSuccess(null);

    try {
      const { blob, filename } = await downloadSendFile(
        shareId,
        password,
        meta?.sizeBytes ?? 0,
        (pct, loaded, total) => {
          setProgress(pct);
          setLoadedBytes(loaded);
          setTotalBytes(total);
        },
      );

      setPhase("saving");
      setProgress(100);
      await downloadBlobAsync(blob, filename || meta?.filename || "download");

      setPhase("done");
      if (meta?.oneTime) {
        setSuccess("Файл сохранён. Ссылка больше не действует.");
        setMeta(null);
      } else {
        setSuccess("Файл сохранён на устройство.");
        void loadMeta();
      }
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : "Ошибка";
      setError(
        /Failed to fetch|NetworkError|Load failed|network/i.test(msg)
          ? "Сеть недоступна или соединение оборвалось. Попробуйте ещё раз."
          : msg,
      );
    }
  };

  const statusLabel =
    phase === "saving"
      ? "Сохранение…"
      : phase === "downloading"
        ? totalBytes > 0
          ? `Скачивание… ${progress}%`
          : "Скачивание…"
        : phase === "done"
          ? "Готово"
          : "Скачать файл";

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4 shadow-sm">
        <div className="text-center">
          <p className="text-4xl mb-2">📨</p>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">QHub Send</h1>
        </div>

        {loading ? (
          <p className="text-sm text-center text-gray-500">Проверка ссылки…</p>
        ) : error && !meta && phase === "idle" && !success ? (
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
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            {(phase === "downloading" || phase === "saving") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {phase === "saving"
                      ? "Открываем сохранение…"
                      : totalBytes > 0
                        ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
                        : formatBytes(loadedBytes)}
                  </span>
                  {phase === "downloading" && totalBytes > 0 && <span>{progress}%</span>}
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-[width] duration-150"
                    style={{
                      width:
                        phase === "saving"
                          ? "100%"
                          : `${Math.max(progress, phase === "downloading" ? 2 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="w-full rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {statusLabel}
            </button>
          </>
        ) : success ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-emerald-600">{success}</p>
            <Link href="/" className="text-sm text-indigo-600 hover:underline">
              На главную
            </Link>
          </div>
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
