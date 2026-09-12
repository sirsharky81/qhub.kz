import { getKgdTaxDebtConfig } from "./env";
import { normalizeTaxDebt, type RawTaxDebtPayload } from "./normalize";
import type { TaxDebtResult } from "./types";

export class KgdTaxDebtError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "not_found" | "unauthorized" | "forbidden" | "not_configured" | "upstream" | "invalid_code",
  ) {
    super(message);
    this.name = "KgdTaxDebtError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readUpstreamMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const err = payload.err;
  if (isRecord(err) && typeof err.error === "string") return err.error;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

async function kgdGet(
  url: URL,
  headers: Record<string, string>,
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 300) };
    }
  }
  return { status: response.status, payload };
}

export async function lookupTaxDebt(
  taxpayerCode: string,
  lang: "ru" | "kk",
): Promise<TaxDebtResult> {
  const config = getKgdTaxDebtConfig();
  if (!config.portalToken || !config.personalAccountToken) {
    throw new KgdTaxDebtError("not_configured", 503, "not_configured");
  }

  const url = new URL("/services/isnaportalsync/public/tax-debt-info", config.baseUrl);
  url.searchParams.set("taxpayerCode", taxpayerCode);
  url.searchParams.set("personalAccountToken", config.personalAccountToken);

  let { status, payload } = await kgdGet(url, {
    "X-Portal-Token": config.portalToken,
  });

  if (status === 403 || status === 401) {
    url.searchParams.set("personalAccountToken", config.portalToken);
    ({ status, payload } = await kgdGet(url, {
      "X-Portal-Token": config.personalAccountToken,
    }));
  }

  if (status === 200 && isRecord(payload)) {
    return normalizeTaxDebt(payload as RawTaxDebtPayload, taxpayerCode, lang);
  }

  const message = readUpstreamMessage(payload);

  // Коды КГД: 400 синтаксис, 403 не авторизован, 404 доступ запрещён, 500 ошибка сервера.
  if (status === 400) {
    throw new KgdTaxDebtError(message || "invalid_code", 400, "invalid_code");
  }
  if (status === 403 || status === 401) {
    throw new KgdTaxDebtError(message || "unauthorized", 502, "unauthorized");
  }
  if (status === 404) {
    throw new KgdTaxDebtError(message || "forbidden", 502, "forbidden");
  }
  if (status === 500) {
    const looksMissing = /not[-_ ]?found|не найден|табылмады|iinbin/i.test(message);
    throw new KgdTaxDebtError(
      message || (looksMissing ? "not_found" : "upstream"),
      looksMissing ? 404 : 502,
      looksMissing ? "not_found" : "upstream",
    );
  }

  throw new KgdTaxDebtError(message || "upstream", 502, "upstream");
}
