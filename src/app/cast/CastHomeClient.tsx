"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { stashCastLocalFile, stashCastPendingPassword } from "@/lib/cast/session";
import { CastShell } from "./components/CastShell";

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

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Поддерживаются только видеофайлы");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setError(null);
    // Soft nav keeps the in-memory File (no server upload yet → no OOM from XHR).
    stashCastLocalFile(file);
    router.push("/cast/watch?local=1");
  }, [router]);

  return (
    <CastShell title="QHub Cast" subtitle="Видео на TV через Chromecast">
      <div className="p-4 space-y-5">
        <section className="space-y-2">
          <label htmlFor="cast-url" className="text-sm font-medium text-gray-800">
            Ссылка на видео
          </label>
          <input
            id="cast-url"
            type="url"
            inputMode="url"
            placeholder="https://…/video.m3u8 или Send /s/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
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
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          )}
          <button
            type="button"
            onClick={handleOpenUrl}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
          >
            Открыть
          </button>
        </section>

        <section className="space-y-2">
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
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Выбрать видео
          </button>
          <p className="text-xs text-gray-500">
            Превью на телефоне без загрузки на сервер. На VPS файл попадает только на время Cast и
            удаляется при смене / отключении / закрытии страницы.
          </p>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <aside className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
          <p>Поддерживаются прямые HTTPS-ссылки (.mp4, .m3u8, .mpd), QHub Send и файлы с телефона.</p>
          <p>YouTube вещается через приложение YouTube на TV — здесь не поддерживается.</p>
          <p>
            Cast на TV: Chrome / Edge / Opera на Android или ПК (не iPhone и не PWA с домашнего экрана).
            Телефон и TV — в одной Wi‑Fi.
          </p>
        </aside>
      </div>
    </CastShell>
  );
}
