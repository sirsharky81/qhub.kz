import { NextResponse } from "next/server";

function extractErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 6; depth++) {
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "string" && cur.trim()) {
      parts.push(cur.trim());
    }
    break;
  }
  return parts.join(" | ");
}

function sanitizeErrorDetail(text: string): string {
  return text
    .replace(/Basic [A-Za-z0-9+/=]+/gi, "Basic ***")
    .replace(/(:\/\/)([^/@\s]+):([^@\s/]+)@/g, "$1$2:***@")
    .slice(0, 280);
}

/** Map send/create failures to user-visible JSON (never generic 500 without hint). */
export function sendCreateErrorResponse(err: unknown): Response {
  const combined = extractErrorText(err).trim();
  console.error("[send-create]", err);

  const detail = sanitizeErrorDetail(combined);

  if (/WebDAV PUT 403|403 Forbidden/i.test(combined)) {
    return NextResponse.json(
      {
        error:
          "Нет прав записи на NAS. Проверьте права пользователя QHub на папку QHubbox и доступ к WebDAV Server.",
        detail,
      },
      { status: 502 },
    );
  }

  if (/WebDAV PUT 401|401 Unauthorized/i.test(combined)) {
    return NextResponse.json(
      {
        error: "Неверный логин или пароль WebDAV на сервере (SEND_WEBDAV_*).",
        detail,
      },
      { status: 502 },
    );
  }

  if (/WebDAV MKCOL 403|WebDAV PUT 405|WebDAV PUT 409|WebDAV MKCOL 405|507 Insufficient Storage/i.test(combined)) {
    return NextResponse.json(
      { error: "NAS отклонил запись. Проверьте WebDAV и права на QHubbox.", detail },
      { status: 502 },
    );
  }

  if (/WebDAV|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed|network|aborted|timeout/i.test(combined)) {
    return NextResponse.json(
      {
        error:
          "NAS недоступен с VPS. Проверьте Tailscale, WebDAV :5005 и SEND_WEBDAV_URL (…/QHubbox).",
        detail,
      },
      { status: 502 },
    );
  }

  if (/не настроен|invalid_key|Redis|ECONNREFUSED.*6379/i.test(combined)) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", detail },
      { status: 503 },
    );
  }

  if (/Не удалось сгенерировать/i.test(combined)) {
    return NextResponse.json({ error: combined.split(" | ")[0]!, detail }, { status: 503 });
  }

  return NextResponse.json(
    {
      error: "Не удалось сохранить файл на NAS",
      detail: detail || undefined,
    },
    { status: 502 },
  );
}
