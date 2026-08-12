"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { stashCastLocalFile, stashCastPendingPassword } from "@/lib/cast/session";

export function CastHomeClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goWatch = useCallback(
    (params: { url?: string }) => {
      if (needsPassword && password.trim()) {
        stashCastPendingPassword(password.trim());
      }
      const sp = new URLSearchParams();
      sp.set("url", params.url ?? "");
      router.push(`/cast/watch?${sp.toString()}`);
    },
    [needsPassword, password, router],
  );

  const handleOpenUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Вставьте ссылку на видео или Send");
      return;
    }
    setError(null);
    goWatch({ url: trimmed });
  }, [goWatch, url]);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setError("Поддерживаются только видеофайлы");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setError(null);
      stashCastLocalFile(file);
      router.push("/cast/watch?local=1");
    },
    [router],
  );

  return (
    <main className="min-h-dvh bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        <header className="text-center space-y-1">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            ← На главную QHub
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">QHub Cast</h1>
          <p className="text-sm text-gray-500">Видео на TV через Chromecast</p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
          <label htmlFor="cast-url" className="block text-sm font-medium text-gray-800">
            Ссылка на видео
          </label>
          <input
            id="cast-url"
            type="url"
            inputMode="url"
            placeholder="https://…/video.m3u8 или Send /s/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleOpenUrl()}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={needsPassword}
              onChange={(e) => setNeedsPassword(e.target.checked)}
            />
            Send-ссылка с паролем
          </label>
          {needsPassword && (
            <input
              type="password"
              placeholder="Пароль Send"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          )}
          <button
            type="button"
            onClick={handleOpenUrl}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Открыть
          </button>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
          <p className="text-sm font-medium text-gray-800">Файл с устройства</p>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Выбрать видео
          </button>
          <p className="text-xs text-gray-500">
            Превью локально. На сервер файл уходит только на время Cast и удаляется при смене,
            отключении или закрытии страницы.
          </p>
        </section>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <aside className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 space-y-1.5 shadow-sm">
          <p>HTTPS (.mp4, .m3u8, .mpd), QHub Send и файлы с телефона.</p>
          <p>YouTube — через приложение YouTube на TV.</p>
          <p>Cast: Chrome / Edge / Opera на Android или ПК, одна Wi‑Fi с TV.</p>
        </aside>
      </div>
    </main>
  );
}
