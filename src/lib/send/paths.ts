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

/** ASCII-only flat path on NAS (no MKCOL subdirs — Synology WebDAV is flaky on nested collections). */
export function buildShareFilePath(shareId: string, originalFilename: string): string {
  const ext = path.extname(originalFilename).replace(/[^\w.-]/g, "").slice(0, 16).toLowerCase();
  return ext.length > 1 ? `${shareId}${ext}` : `${shareId}.bin`;
}

export function storageRootHint(): string {
  if (getSendStorageBackend() === "webdav") {
    return getSendWebDavConfig()?.baseUrl ?? "webdav";
  }
  return getSendLocalRoot();
}
