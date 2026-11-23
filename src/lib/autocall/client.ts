const AUTOCALL_API_BASE = "https://autocall.kz/api/v1";

/** Kazakhstan prefixes accepted by AutoCall. */
const AUTOCALL_KZ_NUMBER_RE =
  /^\+7(700|701|702|705|706|707|708|747|771|775|776|777|778|710|711|712|713|714|715|716|717|718|721|722|723|724|725|726|727|728|729|736)\d{7}$/;

export class AutocallError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "unauthorized" | "payment" | "validation" | "rate_limit" | "unavailable",
  ) {
    super(message);
  }
}

export interface IncomingCallOtp {
  id: number;
  callTo: string;
  status: string;
}

export function getAutocallApiKey(): string {
  return process.env.AUTOCALL_API_KEY?.trim() ?? "";
}

export function isAutocallConfigured(): boolean {
  return Boolean(getAutocallApiKey());
}

export function isAutocallStubEnabled(): boolean {
  return process.env.AUTOCALL_OTP_STUB === "1" && process.env.NODE_ENV !== "production";
}

export function isAutocallKzNumber(phone: string): boolean {
  return AUTOCALL_KZ_NUMBER_RE.test(phone);
}

interface AutocallErrorBody {
  message?: string;
  error?: string;
  retry_after?: number;
  errors?: Record<string, string[]>;
}

function userMessageForStatus(status: number, fallback: string): {
  message: string;
  code: AutocallError["code"];
} {
  if (status === 401) {
    return { message: "Сервис подтверждения не настроен", code: "unauthorized" };
  }
  if (status === 402) {
    return { message: "Недостаточно средств для звонка", code: "payment" };
  }
  if (status === 429) {
    return { message: fallback || "Слишком много звонков. Подождите несколько минут.", code: "rate_limit" };
  }
  if (status === 422 || status === 451) {
    return { message: fallback || "Не удалось подтвердить номер", code: "validation" };
  }
  return { message: "Сервис подтверждения временно недоступен", code: "unavailable" };
}

async function parseAutocallError(res: Response): Promise<AutocallError> {
  const body = (await res.json().catch(() => null)) as AutocallErrorBody | null;
  const fieldError = body?.errors
    ? Object.values(body.errors).flat().find((item) => item.trim())
    : undefined;
  const retryAfter =
    typeof body?.retry_after === "number" && body.retry_after > 0
      ? ` Подождите ${body.retry_after} с.`
      : "";
  const fallback = `${fieldError || body?.message?.trim() || ""}${retryAfter}`.trim();
  const mapped = userMessageForStatus(res.status, fallback);
  const status = res.status >= 400 && res.status < 500 && res.status !== 404 ? res.status : 502;
  return new AutocallError(mapped.message, status, mapped.code);
}

async function autocallFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = getAutocallApiKey();
  if (!apiKey) {
    throw new AutocallError("Сервис подтверждения не настроен", 503, "unavailable");
  }
  return fetch(`${AUTOCALL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

/**
 * Missed incoming-call OTP: AutoCall returns a number the user must dial.
 * The call is dropped (busy) and is free for the subscriber. Flash Call is no longer available.
 */
export async function createIncomingCallOtp(input: {
  number: string;
  callbackUrl: string;
  ttlSec: number;
}): Promise<IncomingCallOtp> {
  if (!isAutocallKzNumber(input.number)) {
    throw new AutocallError("Не удалось подтвердить этот номер", 422, "validation");
  }

  if (isAutocallStubEnabled()) {
    return { id: 1, callTo: "+77070000000", status: "pending" };
  }

  const res = await autocallFetch("/otp/incoming-call", {
    method: "POST",
    body: JSON.stringify({
      number: input.number,
      type: "missed",
      callback_url: input.callbackUrl,
      ttl: input.ttlSec,
    }),
  });

  if (!res.ok) {
    throw await parseAutocallError(res);
  }

  const data = (await res.json()) as { id?: number; call_to?: string; status?: string };
  if (!data.id || !data.call_to) {
    throw new AutocallError("Сервис подтверждения временно недоступен", 502, "unavailable");
  }

  return {
    id: Number(data.id),
    callTo: String(data.call_to),
    status: String(data.status ?? "pending"),
  };
}

export async function getIncomingCallOtp(id: number): Promise<IncomingCallOtp> {
  if (isAutocallStubEnabled()) {
    return { id, callTo: "+77070000000", status: "verified" };
  }

  const res = await autocallFetch(`/otp/${id}`, { method: "GET" });
  if (!res.ok) {
    throw await parseAutocallError(res);
  }

  const data = (await res.json()) as { id?: number; call_to?: string; status?: string };
  if (!data.status) {
    throw new AutocallError("Сервис подтверждения временно недоступен", 502, "unavailable");
  }

  return {
    id: Number(data.id) || id,
    callTo: String(data.call_to ?? ""),
    status: String(data.status),
  };
}
