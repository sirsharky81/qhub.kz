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

type UploadPhase = "idle" | "uploading" | "creating" | "done";

type CreateSendResponse = {
  error?: string;
  detail?: string;
  url?: string;
  urlPath?: string;
  shareId?: string;
  filename?: string;
  sizeBytes?: number;
  expiresAt?: number;
  hasPassword?: boolean;
  oneTime?: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildShareUrl(shareId: string, urlPath?: string): string {
  if (typeof window === "undefined") return `https://www.qhub.kz/s/${shareId}`;
  const path = urlPath ?? `/s/${shareId}`;
  return `${window.location.origin}${path}`;
}

function formatExpiry(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uploadSendCreate(
  form: FormData,
  onProgress: (pct: number, loaded: number, total: number) => void,
): Promise<CreateSendResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/send/create");
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)), event.loaded, event.total);
      }
    });

    xhr.addEventListener("load", () => {
      const contentType = xhr.getResponseHeader("Content-Type") ?? "";
      const isJson = contentType.includes("application/json");

      if (!isJson) {
        if (xhr.status === 413) {
          reject(new Error("Файл слишком большой для сервера (лимит nginx). Попробуйте позже или файл меньше."));
          return;
        }
        if (xhr.status === 502 || xhr.status === 504) {
          reject(new Error("Сервер не успел обработать файл. Попробуйте ещё раз."));
          return;
        }
        if (xhr.status === 401 || xhr.status === 403) {
          reject(new Error("Нет доступа. Войдите в мессенджер или проверьте Send в whitelist."));
          return;
        }
        reject(new Error(`Ошибка сервера (HTTP ${xhr.status || "?"}). Обновите страницу и попробуйте снова.`));
        return;
      }

      let data: CreateSendResponse = {};
      try {
        data = JSON.parse(xhr.responseText) as CreateSendResponse;
      } catch {
        reject(new Error("Неверный ответ сервера"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      reject(new Error(data.detail ? `${data.error ?? "Ошибка загрузки"} (${data.detail})` : (data.error ?? "Ошибка загрузки")));
    });

    xhr.addEventListener("error", () => reject(new Error("Сеть недоступна")));
    xhr.addEventListener("abort", () => reject(new Error("Загрузка отменена")));

    xhr.send(form);
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
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLoaded, setUploadLoaded] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
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
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const busy = uploadPhase === "uploading" || uploadPhase === "creating";
  const filesReady = files.length > 0;
  const totalFileBytes = files.reduce((s, f) => s + f.size, 0);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/send/status?probe=1");
      const data = (await res.json()) as {
        allowed?: boolean;
        configured?: boolean;
        loggedIn?: boolean;
        storage?: { ok?: boolean; error?: string };
      };
      setAllowed(Boolean(data.allowed));
      setConfigured(Boolean(data.configured));
      setLoggedIn(Boolean(data.loggedIn));
      if (data.storage && data.storage.ok === false) {
        setStorageWarning(data.storage.error ?? "NAS недоступен");
      } else {
        setStorageWarning(null);
      }
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

  const resetUploadState = () => {
    setUploadPhase("idle");
    setUploadProgress(0);
    setUploadLoaded(0);
    setUploadTotal(0);
  };

  const onPickFiles = (list: FileList | File[] | null) => {
    if (!list || busy) return;
    setFiles(Array.from(list));
    setError(null);
    setResult(null);
    resetUploadState();
  };

  const removeFile = (index: number) => {
    if (busy) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
    resetUploadState();
  };

  const onUpload = async () => {
    if (files.length === 0 || busy) return;

    setUploadPhase("uploading");
    setUploadProgress(0);
    setUploadLoaded(0);
    setUploadTotal(totalFileBytes);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.set("expiry", expiry);
      if (password.trim()) form.set("password", password.trim());
      if (oneTime) form.set("oneTime", "1");

      const data = await uploadSendCreate(form, (pct, loaded, total) => {
        setUploadProgress(pct);
        setUploadLoaded(loaded);
        setUploadTotal(total);
        if (pct >= 100) setUploadPhase("creating");
      });

      setUploadPhase("done");
      const shareId = data.shareId!;
      const urlPath = data.urlPath ?? `/s/${shareId}`;
      setResult({
        url: buildShareUrl(shareId, urlPath),
        shareId,
        filename: data.filename!,
        sizeBytes: data.sizeBytes!,
        expiresAt: data.expiresAt!,
        hasPassword: Boolean(data.hasPassword),
        oneTime: Boolean(data.oneTime),
      });
      setFiles([]);
      setPassword("");
      setOneTime(false);
      resetUploadState();
      void loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      resetUploadState();
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

  const submitLabel = (() => {
    if (!filesReady) return "Сначала выберите файлы";
    if (uploadPhase === "uploading") {
      return uploadTotal > 0
        ? `Загрузка… ${uploadProgress}%`
        : "Загрузка…";
    }
    if (uploadPhase === "creating") return "Создание ссылки…";
    return "Получить ссылку";
  })();

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

        {storageWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-medium">NAS недоступен с сервера</p>
            <p className="mt-1 opacity-90 break-words">{storageWarning}</p>
          </div>
        )}

        {!result ? (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4 shadow-sm">
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && !busy && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) e.currentTarget.classList.add("border-indigo-400");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-indigo-400");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-indigo-400");
                onPickFiles(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                busy
                  ? "border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed"
                  : "border-gray-200 dark:border-gray-700 cursor-pointer hover:border-indigo-400"
              }`}
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {filesReady
                  ? "Файлы выбраны — можно создать ссылку"
                  : "Перетащите файлы или нажмите для выбора"}
              </p>
              {!filesReady && (
                <p className="text-xs text-gray-400 mt-1">Кнопка станет активной после выбора</p>
              )}
              <input
                ref={inputRef}
                type="file"
                multiple
                disabled={busy}
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>

            {filesReady && (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    {files.length} файл(ов) · {formatBytes(totalFileBytes)}
                  </p>
                  {!busy && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Готово к отправке
                    </span>
                  )}
                </div>
                <ul className="max-h-36 overflow-y-auto space-y-1">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300"
                    >
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        {formatBytes(file.size)}
                        {!busy && (
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="text-red-500 hover:underline"
                            aria-label={`Удалить ${file.name}`}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {busy && (
              <div className="space-y-2" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {uploadPhase === "creating"
                      ? "Файл на NAS, создаём ссылку…"
                      : "Загрузка на сервер…"}
                  </span>
                  {uploadPhase === "uploading" && uploadTotal > 0 && (
                    <span>
                      {formatBytes(uploadLoaded)} / {formatBytes(uploadTotal)}
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      uploadPhase === "creating"
                        ? "bg-indigo-400 animate-pulse w-full"
                        : "bg-indigo-600"
                    }`}
                    style={
                      uploadPhase === "creating"
                        ? undefined
                        : { width: `${Math.max(uploadProgress, uploadPhase === "uploading" ? 2 : 0)}%` }
                    }
                  />
                </div>
                {uploadPhase === "uploading" && uploadTotal > 0 && (
                  <p className="text-xs text-center text-indigo-600 dark:text-indigo-400 font-medium">
                    {uploadProgress}%
                  </p>
                )}
              </div>
            )}

            <div className={busy ? "opacity-50 pointer-events-none" : undefined}>
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

            <label className={`block ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              <span className="text-xs font-medium text-gray-500">Пароль (необязательно)</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                placeholder="Для получателя"
                autoComplete="new-password"
              />
            </label>

            <label
              className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 ${
                busy ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={oneTime}
                onChange={(e) => setOneTime(e.target.checked)}
                disabled={busy}
                className="rounded"
              />
              Одноразовая ссылка (удалить после скачивания)
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={!filesReady || busy}
              onClick={() => void onUpload()}
              className={`w-full rounded-xl py-2.5 text-sm font-medium transition-colors ${
                !filesReady || busy
                  ? "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {submitLabel}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900 p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600">
                ✓
              </span>
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ссылка готова</p>
                <p className="text-xs text-gray-500">Файл сохранён на NAS</p>
              </div>
            </div>
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
          {result?.hasPassword ? " и пароль" : password.trim() ? " и пароль" : ""}.
        </p>
      </div>
    </main>
  );
}
