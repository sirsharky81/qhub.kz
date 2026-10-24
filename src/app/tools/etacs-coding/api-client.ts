import type {
  EtacsApplyResult,
  EtacsFileView,
  EtacsSaveResult,
} from "@/lib/etacs-coding/types";
import type { EtacsAccessCheckResult } from "@/lib/etacs-coding/licensing";

const BASE = "/api/etacs-coding";
const DEVICE_ID_STORAGE_KEY = "qhub_etacs_device_id";

export function getOrCreateEtacsDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    existing = `DEV_${randomPart.toUpperCase()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
    return existing;
  } catch {
    return "DEV_FALLBACK";
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Ошибка запроса");
  }
  return body;
}

export async function fetchEtacsStatus(): Promise<{ ready: boolean }> {
  const response = await fetch(`${BASE}/status`, { cache: "no-store" });
  return parseJson(response);
}

export async function parseEtacsFile(
  file: File,
  profileId?: string,
): Promise<EtacsFileView> {
  const url = new URL(`${BASE}/parse`, window.location.origin);
  url.searchParams.set("fileName", file.name);
  if (profileId) url.searchParams.set("profileId", profileId);
  const response = await fetch(url, {
    method: "POST",
    body: await file.arrayBuffer(),
  });
  return parseJson(response);
}

export async function decodeEtacsCoding(payload: {
  vin: string;
  date: string;
  ecuId: string;
  profileId?: string;
  fileName?: string;
  codingHex: string;
  crc: string;
  bom: boolean;
}): Promise<{
  rows: EtacsFileView["rows"];
  profileId: string;
  model: string;
  unit: string;
  matchesBaseline: boolean;
  crcComputed: string | null;
  crcVerified: boolean;
}> {
  const response = await fetch(`${BASE}/decode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function applyEtacsCoding(payload: {
  ecuId: string;
  profileId?: string;
  id: number;
  label: string;
  codingHex: string;
}): Promise<EtacsApplyResult> {
  const response = await fetch(`${BASE}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function saveEtacsCoding(payload: {
  force?: boolean;
  vin: string;
  date: string;
  ecuId: string;
  codingHex: string;
  crc: string;
  bom: boolean;
  fileName?: string;
  promoCode?: string;
}): Promise<EtacsSaveResult> {
  const deviceId = getOrCreateEtacsDeviceId();
  const response = await fetch(`${BASE}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, deviceId }),
  });
  const body = (await response.json()) as EtacsSaveResult & {
    error?: string;
    code?: string;
    crcVerified?: boolean;
  };
  if (response.status === 402 || body.code === "PAYMENT_REQUIRED") {
    const err = new Error(
      body.error || "Требуется активация доступа для этого VIN или код PRO",
    ) as Error & { status?: number; code?: string };
    err.status = 402;
    err.code = "PAYMENT_REQUIRED";
    throw err;
  }
  if (response.status === 409) {
    const err = new Error(body.error || "CRC не подтверждена") as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  if (!response.ok) {
    throw new Error(body.error || "Не удалось сохранить");
  }
  return body;
}

export async function fetchEtacsLicenseStatus(params: {
  vin?: string;
  promoCode?: string;
  fileKind?: "kon" | "cuf";
}): Promise<EtacsAccessCheckResult> {
  const deviceId = getOrCreateEtacsDeviceId();
  const url = new URL(`${BASE}/license`, window.location.origin);
  if (params.vin) url.searchParams.set("vin", params.vin);
  if (params.promoCode) url.searchParams.set("promoCode", params.promoCode);
  if (deviceId) url.searchParams.set("deviceId", deviceId);
  if (params.fileKind) url.searchParams.set("fileKind", params.fileKind);
  const response = await fetch(url, { cache: "no-store" });
  return parseJson(response);
}

export async function redeemEtacsCodeApi(payload: {
  code: string;
  vin?: string;
  ecuId?: string;
}): Promise<{ ok: boolean; message: string }> {
  const deviceId = getOrCreateEtacsDeviceId();
  const response = await fetch(`${BASE}/license`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem", ...payload, deviceId }),
  });
  return parseJson(response);
}

export async function requestEtacsUnlockApi(payload: {
  vin?: string;
  ecuId?: string;
  contact: string;
  plan: "cuf_vin" | "single_vin" | "pro_month" | "pro_year";
  currency?: "KZT" | "RUB";
  comment?: string;
}): Promise<{ ok: boolean; message: string }> {
  const response = await fetch(`${BASE}/license`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "request", ...payload }),
  });
  return parseJson(response);
}
