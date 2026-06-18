import {
  formatDeveloperMessage,
  getDevelopersTopicId,
  sendTelegramMessage,
} from "@/lib/telegram";
import { checkDevelopersRateLimit, getClientIp } from "@/lib/rate-limit";

interface DeveloperRequestBody {
  appName?: string;
  description?: string;
  name?: string;
  contact?: string;
  website?: string;
}

function trimField(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export async function POST(request: Request) {
  try {
    let body: DeveloperRequestBody;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
    }

    if (body.website) {
      return Response.json({ ok: true });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkDevelopersRateLimit(ip);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много отправок. Попробуйте позже." },
        {
          status: 429,
          headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
        },
      );
    }

    const appName = trimField(body.appName, 120);
    const description = trimField(body.description, 2000);
    const name = trimField(body.name, 100);
    const contact = trimField(body.contact, 100);

    if (!appName) {
      return Response.json({ error: "Укажите название приложения" }, { status: 400 });
    }

    if (description.length < 10) {
      return Response.json(
        { error: "Опишите приложение подробнее (минимум 10 символов)" },
        { status: 400 },
      );
    }

    if (!name) {
      return Response.json({ error: "Укажите имя" }, { status: 400 });
    }

    const topicId = getDevelopersTopicId();
    if (!topicId) {
      return Response.json({ error: "Сервис временно недоступен" }, { status: 503 });
    }

    const text = formatDeveloperMessage({
      appName,
      description,
      name,
      contact: contact || undefined,
    });

    const result = await sendTelegramMessage(text, topicId);

    if (!result.ok) {
      if (result.error === "telegram_not_configured") {
        return Response.json({ error: "Сервис временно недоступен" }, { status: 503 });
      }
      return Response.json({ error: "Не удалось отправить заявку" }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/submit-developer] unhandled error:", err);
    return Response.json({ error: "Не удалось отправить заявку" }, { status: 500 });
  }
}
