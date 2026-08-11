import path from "node:path";
import { getSendLocalRoot, getSendStorageBackend, getSendWebDavConfig } from "./config";
import { deleteSendPath, writeSendFile } from "./storage";

export type SendStorageProbe = {
  ok: boolean;
  backend: string;
  error?: string;
};

/** Quick write/delete probe — diagnostics for NAS connectivity. */
export async function probeSendStorage(): Promise<SendStorageProbe> {
  const backend = getSendStorageBackend();
  if (backend === "local") {
    return { ok: true, backend: "local" };
  }

  if (!getSendWebDavConfig()) {
    return { ok: false, backend: "webdav", error: "WebDAV env не задан" };
  }

  const probePath = `_qhub-probe/${Date.now()}.txt`;
  try {
    await writeSendFile(probePath, Buffer.from("qhub-send-probe"));
    await deleteSendPath(probePath);
    return { ok: true, backend: "webdav" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, backend: "webdav", error: message.slice(0, 300) };
  }
}

/**
 * Keep the original filename on NAS (WebDAV path segments are encodeURIComponent'd).
 * Strip path separators / control chars only — avoid renaming to upload.ext.
 */
export function sanitizeStorageFilename(originalFilename: string): string {
  const base = path.basename(originalFilename || "file").normalize("NFC");
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    const ext = path.extname(base).replace(/[^\w.-]/g, "").slice(0, 16).toLowerCase();
    return ext.length > 1 ? `file${ext}` : "file.bin";
  }
  return cleaned;
}

export function buildShareFilePath(shareId: string, originalFilename: string): string {
  return `${shareId}/${sanitizeStorageFilename(originalFilename)}`;
}

export function storageRootHint(): string {
  if (getSendStorageBackend() === "webdav") {
    return getSendWebDavConfig()?.baseUrl ?? "webdav";
  }
  return getSendLocalRoot();
}
