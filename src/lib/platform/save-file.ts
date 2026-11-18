import { isIOSDevice } from "./device";
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

function mimeTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".kon") || lower.endsWith(".cuf") || lower.endsWith(".txt") || lower.endsWith(".log")) {
    return "text/plain;charset=utf-8";
  }
  if (lower.endsWith(".json")) {
    return "application/json;charset=utf-8";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv;charset=utf-8";
  }
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".zip")) {
    return "application/zip";
  }
  return "application/octet-stream";
}

function normalizeBlobForDownload(blob: Blob, filename: string): Blob {
  const currentType = (blob.type || "").toLowerCase();
  if (currentType && currentType !== "application/octet-stream") {
    return blob;
  }
  const inferred = mimeTypeForFilename(filename);
  if (inferred === "application/octet-stream") {
    return blob;
  }
  return new Blob([blob], { type: inferred });
}

function downloadViaAnchor(blob: Blob, filename: string): void {
  const safeName = sanitizeFilename(filename);
  const normalizedBlob = normalizeBlobForDownload(blob, safeName);
  const url = URL.createObjectURL(normalizedBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari shows "Load Failed" if the blob URL is revoked too quickly.
  window.setTimeout(() => URL.revokeObjectURL(url), isIOSDevice() ? 60_000 : 10_000);
}

async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const safeName = sanitizeFilename(filename);
  const normalizedBlob = normalizeBlobForDownload(blob, safeName);
  const type = normalizedBlob.type || "application/octet-stream";
  const file = new File([normalizedBlob], safeName, { type });

  const canShareFiles =
    typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : isIOSDevice();
  if (!canShareFiles) return false;

  try {
    await navigator.share({ files: [file], title: safeName });
    return true;
  } catch (err) {
    // User dismissed the sheet — treat as success so UI does not show a false error.
    if ((err as Error).name === "AbortError") return true;
    return false;
  }
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
 * Prefer the system share sheet (especially on iOS Safari) to avoid the native
 * "Load Failed" banner from blob URLs + anchor downloads.
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
