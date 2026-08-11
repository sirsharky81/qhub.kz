import { NextResponse } from "next/server";

/** Map send/create failures to user-visible JSON (never generic 500 without hint). */
export function sendCreateErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : err instanceof Error && typeof err.cause === "string"
        ? err.cause
        : "";
  const combined = `${message} ${cause}`.trim();
  console.error("[send-create]", err);

  if (/WebDAV PUT 403|403 Forbidden/i.test(combined)) {
    return NextResponse.json(
      {
        error:
          "Нет прав записи на NAS. Проверьте права пользователя QHub на папку QHubbox и доступ к WebDAV Server.",
      },
      { status: 502 },
    );
  }

  if (/WebDAV PUT 401|401 Unauthorized/i.test(combined)) {
    return NextResponse.json(
      { error: "Неверный логин или пароль WebDAV на сервере (SEND_WEBDAV_*)." },
      { status: 502 },
    );
  }

  if (/WebDAV MKCOL 403|WebDAV PUT 405|WebDAV PUT 409/i.test(combined)) {
    return NextResponse.json(
      { error: "NAS отклонил запись. Проверьте WebDAV и права на QHubbox." },
      { status: 502 },
    );
  }

  if (/WebDAV|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(combined)) {
    return NextResponse.json(
      {
        error:
          "NAS недоступен с VPS. Проверьте Tailscale, WebDAV :5005 и SEND_WEBDAV_URL (…/QHubbox).",
      },
      { status: 502 },
    );
  }

  if (/не настроен|invalid_key|Redis|ECONNREFUSED.*6379/i.test(combined)) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту." },
      { status: 503 },
    );
  }

  if (/Не удалось сгенерировать/i.test(combined)) {
    return NextResponse.json({ error: message }, { status: 503 });
  }

  if (
    /Failed to parse body as FormData|expected boundary|body exceeded|multipart/i.test(
      combined,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Файл слишком большой для загрузки через сервер (лимит тела запроса). Попробуйте файл меньше или обратитесь к администратору.",
      },
      { status: 413 },
    );
  }

  return NextResponse.json(
    {
      error: "Не удалось сохранить файл на NAS",
      detail: process.env.NODE_ENV === "development" ? combined.slice(0, 200) : undefined,
    },
    { status: 502 },
  );
}
