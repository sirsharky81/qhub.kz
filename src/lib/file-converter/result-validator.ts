import type { ActionId, ValidationResult } from "./types";

const EXT_BY_ACTION: Partial<Record<ActionId, string[]>> = {
  "image-to-jpg": ["jpg", "jpeg"],
  "image-to-png": ["png"],
  "image-to-webp": ["webp"],
  "image-to-avif": ["avif"],
  "image-to-ico": ["ico"],
  "video-to-mp3": ["mp3"],
  "video-to-webm": ["webm"],
  "video-to-gif": ["gif"],
  "audio-to-mp3": ["mp3"],
  "audio-to-aac": ["aac", "m4a"],
  "audio-to-wav": ["wav"],
  "audio-to-flac": ["flac"],
  "audio-to-ogg": ["ogg"],
  "audio-fix-filename": ["mp3"],
  "pdf-to-txt": ["txt"],
  "pdf-to-jpg": ["jpg", "zip"],
  "pdf-to-png": ["png", "zip"],
  "xlsx-to-csv": ["csv", "zip"],
  "csv-to-xlsx": ["xlsx"],
  "xlsx-to-json": ["json"],
  "json-to-xlsx": ["xlsx"],
  "epub-to-pdf": ["pdf"],
  "epub-to-txt": ["txt"],
  "epub-cover": ["jpg", "png", "webp"],
  "fb2-to-epub": ["epub"],
  "fb2-to-pdf": ["pdf"],
  "fb2-to-txt": ["txt"],
  "mobi-to-epub": ["epub"],
  "mobi-to-pdf": ["pdf"],
  "txt-to-epub": ["epub"],
};

export async function validateResult(
  blob: Blob,
  filename: string,
  actionId: ActionId,
): Promise<ValidationResult> {
  if (!blob || blob.size === 0) {
    return { ok: false, message: "Результат пустой." };
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const allowed = EXT_BY_ACTION[actionId];
  if (allowed && !allowed.includes(ext)) {
    return { ok: false, message: "Формат результата не соответствует действию." };
  }

  if (ext === "zip") return { ok: true };

  if (["jpg", "jpeg", "png", "webp", "gif", "ico", "avif"].includes(ext)) {
    try {
      await verifyImageBlob(blob);
    } catch {
      return { ok: false, message: "Изображение не открывается." };
    }
  }

  if (["mp3", "wav", "ogg", "aac", "flac", "webm"].includes(ext)) {
    if (blob.size < 128) {
      return { ok: false, message: "Аудиофайл слишком мал." };
    }
  }

  if (ext === "txt") {
    const text = await blob.slice(0, 512).text();
    if (text.length === 0 && blob.size > 0) {
      return { ok: true };
    }
  }

  return { ok: true };
}

function verifyImageBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve();
      else reject(new Error("invalid dimensions"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}
