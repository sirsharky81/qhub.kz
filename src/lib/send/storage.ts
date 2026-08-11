import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  getSendLocalRoot,
  getSendStorageBackend,
  getSendWebDavConfig,
} from "./config";

function webdavAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function webdavRequest(
  url: string,
  init: RequestInit & { user: string; pass: string; timeoutMs?: number },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", webdavAuthHeader(init.user, init.pass));
  const { user: _u, pass: _p, timeoutMs = 600_000, ...rest } = init;
  try {
    // Large Send downloads stream NAS→VPS→client; Tailscale home links are ~1–6 MB/s,
    // so keep a long timeout for the whole GET body (default was 120s and aborted mid-file).
    return await fetch(url, { ...rest, headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`WebDAV fetch ${url}: ${msg}`, { cause: err });
  }
}

async function webdavEnsureDir(dirUrl: string, user: string, pass: string): Promise<void> {
  const res = await webdavRequest(dirUrl, { method: "MKCOL", user, pass });
  if (res.ok || res.status === 405 || res.status === 301 || res.status === 302) return;
  if (res.status === 409) return;
  const text = await res.text().catch(() => "");
  throw new Error(`WebDAV MKCOL ${res.status}: ${text.slice(0, 200)}`);
}

async function webdavMkcolPath(baseUrl: string, relativePath: string, user: string, pass: string): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  let current = baseUrl.replace(/\/$/, "");
  for (const part of parts) {
    current = `${current}/${encodeURIComponent(part)}`;
    await webdavEnsureDir(current, user, pass);
  }
}

export async function writeSendFile(relativePath: string, data: Buffer): Promise<void> {
  const backend = getSendStorageBackend();
  if (backend === "webdav") {
    const cfg = getSendWebDavConfig();
    if (!cfg) throw new Error("WebDAV не настроен");
    const dirPath = path.posix.dirname(relativePath);
    if (dirPath !== ".") {
      await webdavMkcolPath(cfg.baseUrl, dirPath, cfg.user, cfg.pass);
    }
    const fileUrl = `${cfg.baseUrl}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
    const res = await webdavRequest(fileUrl, {
      method: "PUT",
      user: cfg.user,
      pass: cfg.pass,
      body: new Uint8Array(data),
      headers: { "Content-Type": "application/octet-stream" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WebDAV PUT ${res.status}: ${text.slice(0, 200)}`);
    }
    return;
  }

  const abs = path.join(getSendLocalRoot(), relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
}

export async function openSendFileStream(relativePath: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  sizeBytes?: number;
}> {
  const backend = getSendStorageBackend();
  if (backend === "webdav") {
    const cfg = getSendWebDavConfig();
    if (!cfg) throw new Error("WebDAV не настроен");
    const fileUrl = `${cfg.baseUrl}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
    const res = await webdavRequest(fileUrl, { method: "GET", user: cfg.user, pass: cfg.pass });
    if (!res.ok) {
      throw new Error(`WebDAV GET ${res.status}`);
    }
    if (!res.body) throw new Error("WebDAV GET empty body");
    const len = res.headers.get("content-length");
    return {
      stream: res.body,
      sizeBytes: len ? Number(len) : undefined,
    };
  }

  const abs = path.join(getSendLocalRoot(), relativePath);
  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return { stream: webStream };
}

export async function deleteSendPath(relativePath: string): Promise<void> {
  const backend = getSendStorageBackend();
  if (backend === "webdav") {
    const cfg = getSendWebDavConfig();
    if (!cfg) return;
    const fileUrl = `${cfg.baseUrl}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
    await webdavRequest(fileUrl, { method: "DELETE", user: cfg.user, pass: cfg.pass }).catch(() => {});
    return;
  }

  const abs = path.join(getSendLocalRoot(), relativePath);
  await rm(abs, { force: true, recursive: true }).catch(() => {});
}

/** Delete share directory `{shareId}/`. */
export async function deleteSendShare(shareId: string): Promise<void> {
  await deleteSendPath(shareId);
}
