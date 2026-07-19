import { isNativePlatform } from "./runtime";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",", 2)[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\-()+\u0400-\u04FF ]+/g, "_") || "file";
}

function downloadViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(filename);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  const safeName = sanitizeFilename(filename);
  const file = new File([blob], safeName, { type: blob.type || "application/octet-stream" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: safeName });
      return true;
    } catch (err) {
      if ((err as Error).name === "AbortError") return true;
    }
  }
  return false;
}

async function saveNative(blob: Blob, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  const safeName = sanitizeFilename(filename);
  const base64 = await blobToBase64(blob);

  const written = await Filesystem.writeFile({
    path: safeName,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: safeName,
      url: written.uri,
      dialogTitle: "Сохранить или отправить файл",
    });
  } catch (err) {
    if ((err as Error).message?.includes("cancel")) return;
    throw err;
  }
}

/** Browser download only — no share sheet. */
export function downloadBlobDirect(blob: Blob, filename: string): void {
  downloadViaAnchor(blob, filename);
}

/**
 * Save or share a blob — works in browser, PWA, and Capacitor WebView.
 * On native opens the system share sheet (Save to Files, Drive, etc.).
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<void> {
  if (isNativePlatform()) {
    await saveNative(blob, filename);
    return;
  }

  if (await shareFile(blob, filename)) return;
  downloadViaAnchor(blob, filename);
}

/** Sync wrapper name used across tools — delegates to async save. */
export function downloadBlob(blob: Blob, filename: string): void {
  void saveBlobToDevice(blob, filename);
}

export async function downloadBlobAsync(blob: Blob, filename: string): Promise<void> {
  await saveBlobToDevice(blob, filename);
}
