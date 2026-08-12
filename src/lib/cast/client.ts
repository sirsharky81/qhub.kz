import { platformFetch, resolveApiUrl } from "@/lib/platform/api-client";
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
  options?: { replaceUploadId?: string },
): Promise<{ media: CastResolvedMedia; watchUrl: string; uploadId: string }> {
  const form = new FormData();
  form.append("file", file);
  if (options?.replaceUploadId?.trim()) {
    form.append("replaceUploadId", options.replaceUploadId.trim());
  }

  // XHR: real upload progress + no forced JSON Content-Type (FormData needs multipart boundary).
  const data = await new Promise<{ media: CastResolvedMedia; watchUrl: string; uploadId: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", resolveApiUrl("/api/cast/upload"));

      xhr.upload.addEventListener("progress", (event) => {
        if (!onProgress) return;
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      });

      xhr.addEventListener("load", () => {
        const contentType = xhr.getResponseHeader("Content-Type") ?? "";
        const isJson = contentType.includes("application/json");
        let payload: {
          error?: string;
          media?: CastResolvedMedia;
          watchUrl?: string;
          upload?: { uploadId?: string };
        } = {};
        if (isJson) {
          try {
            payload = JSON.parse(xhr.responseText) as typeof payload;
          } catch {
            reject(new Error("Неверный ответ сервера"));
            return;
          }
        }
        const uploadId = payload.upload?.uploadId?.trim() ?? "";
        if (xhr.status >= 200 && xhr.status < 300 && payload.media && payload.watchUrl && uploadId) {
          onProgress?.(100);
          resolve({ media: payload.media, watchUrl: payload.watchUrl, uploadId });
          return;
        }
        if (xhr.status === 413) {
          reject(new Error(payload.error ?? "Файл слишком большой"));
          return;
        }
        reject(new Error(payload.error ?? "Не удалось загрузить файл"));
      });

      xhr.addEventListener("error", () => reject(new Error("Нет связи с сервером")));
      xhr.addEventListener("abort", () => reject(new Error("Загрузка отменена")));
      xhr.send(form);
    },
  );

  return data;
}

/** Best-effort delete of ephemeral server upload (keepalive for pagehide). */
export function deleteCastUploadApi(uploadId: string, opts?: { keepalive?: boolean }): void {
  const id = uploadId.trim();
  if (!id) return;
  const url = resolveApiUrl(`/api/cast/upload/${encodeURIComponent(id)}`);
  void fetch(url, {
    method: "DELETE",
    keepalive: opts?.keepalive ?? false,
    credentials: "same-origin",
  }).catch(() => {});
}

export function mediaFromLocalFile(file: File, blobUrl: string): CastResolvedMedia {
  return {
    title: file.name || "Видео",
    streamUrl: blobUrl,
    contentType: file.type || "video/mp4",
    source: "upload",
  };
}
