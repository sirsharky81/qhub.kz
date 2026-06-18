function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface IdeaSubmission {
  idea: string;
  name: string;
  contact?: string;
}

export function formatIdeaMessage({ idea, name, contact }: IdeaSubmission): string {
  const lines = [
    "💡 <b>Новая идея для QHub</b>",
    "",
    `<b>Идея:</b>\n${escapeHtml(idea)}`,
    "",
    `<b>От:</b> ${escapeHtml(name)}`,
  ];

  if (contact) {
    lines.push(`<b>Контакт:</b> ${escapeHtml(contact)}`);
  }

  lines.push("", "<i>Источник: qhub.kz</i>");
  return lines.join("\n");
}

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  const topicId = cleanEnv(process.env.TELEGRAM_IDEAS_TOPIC_ID);

  if (!token || !chatId || !topicId) {
    return { ok: false, error: "telegram_not_configured" };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: Number(topicId),
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[telegram] sendMessage failed:", res.status, body);
    return { ok: false, error: "telegram_send_failed" };
  }

  return { ok: true };
}
