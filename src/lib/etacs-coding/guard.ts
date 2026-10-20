import { NextResponse } from "next/server";
import { checkEtacsCodingRateLimit, getClientIp } from "@/lib/rate-limit";
import { isEtacsDictionaryReady } from "@/lib/etacs-coding/datastore";

const MAX_PARSE_BYTES = 256 * 1024;

export function etacsServiceDisabledResponse(): NextResponse | null {
  if (process.env.ETACS_CODING_ENABLED === "0") {
    return NextResponse.json({ error: "Сервис кодировок ETACS временно недоступен" }, { status: 503 });
  }
  if (!isEtacsDictionaryReady()) {
    return NextResponse.json(
      {
        error:
          "Справочники ETACS не подключены на сервере. Администратор должен задать ETACS_DICTIONARY_DIR.",
      },
      { status: 503 },
    );
  }
  return null;
}

export async function enforceEtacsCodingAccess(
  request: Request,
): Promise<NextResponse | null> {
  const disabled = etacsServiceDisabledResponse();
  if (disabled) return disabled;

  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkEtacsCodingRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов. Подождите и попробуйте снова." },
      {
        status: 429,
        headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
      },
    );
  }
  return null;
}

export function assertParseBodySize(buffer: Buffer): NextResponse | null {
  if (buffer.length > MAX_PARSE_BYTES) {
    return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
  }
  return null;
}

/** Strip internal paths from error messages before sending to client. */
export function publicEtacsErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Ошибка сервера";
  if (/ENOENT|ETACS_DICTIONARY|dictionary|blocks\//i.test(raw)) {
    return "Справочник для этого файла недоступен";
  }
  return raw;
}
