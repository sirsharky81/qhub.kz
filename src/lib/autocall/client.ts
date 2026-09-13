const AUTOCALL_API_BASE = "https://autocall.kz/api/v1";

/** Kazakhstan prefixes accepted by AutoCall Flash Call. */
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

export interface FlashCallResult {
  id: number;
  code: string;
  number: string;
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
    return { message: "Слишком много звонков. Подождите несколько минут.", code: "rate_limit" };
  }
  if (status === 422) {
    return { message: fallback || "Не удалось позвонить на этот номер", code: "validation" };
  }
  return { message: "Сервис подтверждения временно недоступен", code: "unavailable" };
}

async function parseAutocallError(res: Response): Promise<AutocallError> {
  const body = (await res.json().catch(() => null)) as AutocallErrorBody | null;
  const fieldError = body?.errors
    ? Object.values(body.errors).flat().find((item) => item.trim())
    : undefined;
  const fallback = fieldError || body?.message?.trim() || "";
  const mapped = userMessageForStatus(res.status, fallback);
  return new AutocallError(mapped.message, res.status, mapped.code);
}

export async function sendFlashCall(input: {
  number: string;
  digits?: number;
  code?: string;
}): Promise<FlashCallResult> {
  if (!isAutocallKzNumber(input.number)) {
    throw new AutocallError("Не удалось позвонить на этот номер", 422, "validation");
  }

  if (isAutocallStubEnabled()) {
    const digits = input.digits ?? input.code?.length ?? 4;
    return {
      id: 0,
      code: input.code ?? input.number.replace(/\D/g, "").slice(-digits),
      number: input.number,
    };
  }

  const apiKey = getAutocallApiKey();
  if (!apiKey) {
    throw new AutocallError("Сервис подтверждения не настроен", 503, "unavailable");
  }

  const body = input.code
    ? { number: input.number, code: input.code }
    : { number: input.number, digits: input.digits ?? 4 };

  const res = await fetch(`${AUTOCALL_API_BASE}/flash-calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseAutocallError(res);
  }

  const data = (await res.json()) as Partial<FlashCallResult>;
  if (!data.code || !data.number) {
    throw new AutocallError("Сервис подтверждения временно недоступен", 502, "unavailable");
  }

  return {
    id: Number(data.id) || 0,
    code: String(data.code),
    number: String(data.number),
  };
}
