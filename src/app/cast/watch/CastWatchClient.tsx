"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { resolveCastUploadApi, resolveCastUrlApi } from "@/lib/cast/client";
import type { CastResolvedMedia } from "@/lib/cast/types";
import { CastPlayer } from "../components/CastPlayer";
import { CastRemoteControls } from "../components/CastRemoteControls";
import { CastShell } from "../components/CastShell";

export function CastWatchClient() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url")?.trim() ?? "";
  const uploadParam = searchParams.get("upload")?.trim() ?? "";
  const password = searchParams.get("pw")?.trim() ?? "";

  const [media, setMedia] = useState<CastResolvedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let resolved: CastResolvedMedia;
        if (uploadParam) {
          resolved = await resolveCastUploadApi(uploadParam);
        } else if (urlParam) {
          resolved = await resolveCastUrlApi(urlParam, password || undefined);
        } else {
          throw new Error("Не указана ссылка или загрузка");
        }
        if (!cancelled) setMedia(resolved);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось открыть видео");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uploadParam, urlParam, password]);

  return (
    <CastShell title="QHub Cast" subtitle={media?.title ?? "Просмотр"} backHref="/cast">
      <div className="p-4 space-y-4">
        {loading && <p className="text-sm text-gray-500">Подготовка потока…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {media && (
          <>
            <h2 className="text-base font-semibold text-gray-900 break-words">{media.title}</h2>
            {media.warnings?.map((w) => (
              <p key={w} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                {w}
              </p>
            ))}
            <CastPlayer media={media} />
            <CastRemoteControls media={media} onError={setError} />
          </>
        )}
      </div>
    </CastShell>
  );
}
