import { MAX_ENCRYPTED_FILE_BYTES } from "./constants";

export async function compressImageIfNeeded(file: File): Promise<{ blob: Blob; compressed: boolean }> {
  if (!file.type.startsWith("image/")) {
    return { blob: file, compressed: false };
  }
  if (file.size <= MAX_ENCRYPTED_FILE_BYTES * 0.7) {
    return { blob: file, compressed: false };
  }

  const bitmap = await createImageBitmap(file);
  const maxDim = 1280;
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, compressed: false };
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("compress failed"))),
      "image/jpeg",
      0.82,
    );
  });
  return { blob, compressed: true };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save base64 media to disk; on iOS uses the share sheet when direct download is unavailable. */
export async function saveBase64Media(
  base64: string,
  mime: string,
  filename: string,
): Promise<void> {
  const blob = base64ToBlob(base64, mime);
  const file = new File([blob], filename, { type: mime });

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }

  downloadBlob(blob, filename);
}
