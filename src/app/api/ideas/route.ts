import { formatIdeaMessage, sendTelegramMessage } from "@/lib/telegram";
import { checkIdeasRateLimit, getClientIp } from "@/lib/rate-limit";

interface IdeaRequestBody {
  idea?: string;
  name?: string;
  contact?: string;
  website?: string;
}

function trimField(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export async function POST(request: Request) {
  let body: IdeaRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  if (body.website) {
    return Response.json({ ok: true });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkIdeasRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: "Слишком много отправок. Попробуйте позже." },
      {
        status: 429,
        headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
      },
    );
  }

  const idea = trimField(body.idea, 2000);
  const name = trimField(body.name, 100);
  const contact = trimField(body.contact, 100);

  if (idea.length < 10) {
    return Response.json({ error: "Опишите идею подробнее (минимум 10 символов)" }, { status: 400 });
  }

  if (!name) {
    return Response.json({ error: "Укажите имя" }, { status: 400 });
  }

  const text = formatIdeaMessage({
    idea,
    name,
    contact: contact || undefined,
  });

  const result = await sendTelegramMessage(text);

  if (!result.ok) {
    if (result.error === "telegram_not_configured") {
      return Response.json(
        { error: "Сервис временно недоступен" },
        { status: 503 },
      );
    }
    return Response.json({ error: "Не удалось отправить идею" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
