import { platformFetch } from "@/lib/platform/api-client";
import type { CastResolvedMedia } from "./types";

export async function resolveCastUrlApi(
  url: string,
  password?: string,
): Promise<CastResolvedMedia> {
  const res = await platformFetch("/api/cast/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, password: password?.trim() || undefined }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(data.error ?? "Не удалось обработать ссылку");
    (err as Error & { code?: string }).code = data.code;
    throw err;
  }
  return (await res.json()) as CastResolvedMedia;
}

export async function resolveCastUploadApi(uploadId: string): Promise<CastResolvedMedia> {
  const res = await platformFetch("/api/cast/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось открыть загрузку");
  }
  return (await res.json()) as CastResolvedMedia;
}

export async function uploadCastFileApi(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ media: CastResolvedMedia; watchUrl: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await platformFetch("/api/cast/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось загрузить файл");
  }

  onProgress?.(100);
  const data = (await res.json()) as { media: CastResolvedMedia; watchUrl: string };
  return data;
}
