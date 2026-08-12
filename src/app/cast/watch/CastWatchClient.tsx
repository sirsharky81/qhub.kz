"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteCastUploadApi,
  mediaFromLocalFile,
  resolveCastUploadApi,
  resolveCastUrlApi,
  uploadCastFileApi,
} from "@/lib/cast/client";
import { endCastSession } from "@/lib/cast/cast-sdk";
import { takeCastLocalFile, takeCastPendingPassword } from "@/lib/cast/session";
import type { CastResolvedMedia } from "@/lib/cast/types";
import { CastPlayer } from "../components/CastPlayer";
import { CastRemoteControls } from "../components/CastRemoteControls";
import { CastShell } from "../components/CastShell";

export function CastWatchClient() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url")?.trim() ?? "";
  const uploadParam = searchParams.get("upload")?.trim() ?? "";
  const localParam = searchParams.get("local")?.trim() === "1";

  const [previewMedia, setPreviewMedia] = useState<CastResolvedMedia | null>(null);
  const [castMedia, setCastMedia] = useState<CastResolvedMedia | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(uploadParam || null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const blobUrlRef = useRef<string | null>(null);
  const uploadIdRef = useRef<string | null>(uploadParam || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const applyLocalFile = useCallback(
    (file: File) => {
      revokeBlob();
      const blobUrl = URL.createObjectURL(file);
      blobUrlRef.current = blobUrl;
      const media = mediaFromLocalFile(file, blobUrl);
      setLocalFile(file);
      setPreviewMedia(media);
      // Until Cast uploads, cast target is unset (blob is not reachable by Chromecast).
      setCastMedia(null);
    },
    [revokeBlob],
  );

  const purgeServerUpload = useCallback((id: string | null, keepalive = false) => {
    if (!id) return;
    deleteCastUploadApi(id, { keepalive });
    if (uploadIdRef.current === id) {
      uploadIdRef.current = null;
      setUploadId(null);
    }
  }, []);

  useEffect(() => {
    uploadIdRef.current = uploadId;
  }, [uploadId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (localParam) {
          const file = takeCastLocalFile();
          if (!file) {
            throw new Error("Файл не найден — выберите видео снова на главной Cast");
          }
          if (!cancelled) applyLocalFile(file);
          return;
        }

        if (uploadParam) {
          const resolved = await resolveCastUploadApi(uploadParam);
          if (cancelled) return;
          setPreviewMedia(resolved);
          setCastMedia(resolved);
          setUploadId(uploadParam);
          setLocalFile(null);
          return;
        }

        if (urlParam) {
          const password = takeCastPendingPassword() ?? undefined;
          const resolved = await resolveCastUrlApi(urlParam, password);
          if (cancelled) return;
          setPreviewMedia(resolved);
          setCastMedia(resolved);
          setLocalFile(null);
          setUploadId(null);
          return;
        }

        throw new Error("Не указана ссылка или загрузка");
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
  }, [uploadParam, urlParam, localParam, applyLocalFile]);

  // Cleanup blob URL on leave; server file via pagehide / disconnect / «Другое видео»
  // (avoid React Strict Mode unmount purge wiping a just-opened upload= link).
  useEffect(() => {
    const onLeave = () => {
      purgeServerUpload(uploadIdRef.current, true);
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      revokeBlob();
    };
  }, [purgeServerUpload, revokeBlob]);

  const ensureCastMedia = useCallback(
    async (onProgress?: (pct: number) => void): Promise<CastResolvedMedia> => {
      if (localFile) {
        if (castMedia) return castMedia;
        onProgress?.(0);
        const { media, uploadId: newId } = await uploadCastFileApi(localFile, onProgress, {
          replaceUploadId: uploadIdRef.current ?? undefined,
        });
        uploadIdRef.current = newId;
        setUploadId(newId);
        setCastMedia(media);
        return media;
      }
      if (castMedia) return castMedia;
      throw new Error("Нет видео для Cast");
    },
    [localFile, castMedia],
  );

  const handlePickOtherVideo = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setError("Поддерживаются только видеофайлы");
        return;
      }
      setError(null);
      try {
        endCastSession(true);
      } catch {
        /* not connected */
      }
      const previousUploadId = uploadIdRef.current;
      applyLocalFile(file);
      setCastMedia(null);
      if (previousUploadId) {
        purgeServerUpload(previousUploadId);
      }
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/cast/watch?local=1");
      }
    },
    [applyLocalFile, purgeServerUpload],
  );

  const handleDisconnectCleanup = useCallback(() => {
    purgeServerUpload(uploadIdRef.current);
    setCastMedia(localFile ? null : castMedia);
  }, [purgeServerUpload, localFile, castMedia]);

  return (
    <CastShell
      title="QHub Cast"
      subtitle={previewMedia?.title ?? "Просмотр"}
      backHref="/cast"
      onBack={() => purgeServerUpload(uploadIdRef.current, true)}
    >
      <div className="p-4 space-y-4">
        {loading && <p className="text-sm text-gray-500">Подготовка потока…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {previewMedia && (
          <>
            <h2 className="text-base font-semibold text-gray-900 break-words">{previewMedia.title}</h2>
            {previewMedia.warnings?.map((w) => (
              <p key={w} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                {w}
              </p>
            ))}
            <CastPlayer media={previewMedia} />
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handlePickOtherVideo(file);
              }}
            />
            <CastRemoteControls
              previewMedia={previewMedia}
              ensureCastMedia={ensureCastMedia}
              uploadPct={uploadPct}
              onUploadPct={setUploadPct}
              onError={setError}
              onRequestOtherVideo={() => fileInputRef.current?.click()}
              onDisconnectCleanup={handleDisconnectCleanup}
              canPickOtherVideo
            />
          </>
        )}
      </div>
    </CastShell>
  );
}
