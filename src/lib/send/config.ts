import { DEFAULT_SEND_MAX_BYTES } from "./constants";

export type SendStorageBackend = "local" | "webdav";

export function isSendEnabled(): boolean {
  return process.env.SEND_ENABLED === "1" || process.env.SEND_ENABLED === "true";
}

export function getSendMaxBytes(): number {
  const raw = process.env.SEND_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_SEND_MAX_BYTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SEND_MAX_BYTES;
}

export function getSendStorageBackend(): SendStorageBackend {
  const raw = process.env.SEND_STORAGE_BACKEND?.trim().toLowerCase();
  if (raw === "webdav") return "webdav";
  return "local";
}

export function getSendLocalRoot(): string {
  return process.env.SEND_STORAGE_ROOT?.trim() || ".data/send";
}

export function getSendWebDavConfig(): {
  baseUrl: string;
  user: string;
  pass: string;
} | null {
  const baseUrl = process.env.SEND_WEBDAV_URL?.trim().replace(/\/$/, "");
  const user = process.env.SEND_WEBDAV_USER?.trim() ?? "";
  const pass = process.env.SEND_WEBDAV_PASS?.trim() ?? "";
  if (!baseUrl || !user || !pass) return null;
  return { baseUrl, user, pass };
}

export function isSendStorageConfigured(): boolean {
  if (!isSendEnabled()) return false;
  if (getSendStorageBackend() === "webdav") {
    return getSendWebDavConfig() !== null;
  }
  return true;
}
