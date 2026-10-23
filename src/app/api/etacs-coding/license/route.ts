import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import {
  approveEtacsUnlockRequest,
  checkEtacsAccess,
  createEtacsUnlockRequest,
  redeemEtacsPromoCode,
  signQuickApproveToken,
  verifyQuickApproveToken,
} from "@/lib/etacs-coding/licensing";
import { getDevelopersTopicId, getIdeasTopicId, sendTelegramMessage } from "@/lib/telegram";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * GET /api/etacs-coding/license?vin=...&promoCode=...
 * Также поддерживает быстрый клик из Telegram:
 * GET /api/etacs-coding/license?approveId=ET-...&sig=...
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const approveId = url.searchParams.get("approveId");
  const sig = url.searchParams.get("sig");

  if (approveId && sig) {
    if (!verifyQuickApproveToken(approveId, sig)) {
      return new NextResponse("Недействительная подпись подтверждения", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    try {
      const res = await approveEtacsUnlockRequest(approveId);
      const html = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заявка подтверждена</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:20px;border:1px solid #d1fae5;background:#ecfdf5;border-radius:16px;color:#065f46;">
  <h2 style="margin-top:0;">✅ Заявка ${escapeHtml(res.request.id)} подтверждена!</h2>
  <p><strong>VIN:</strong> <code>${escapeHtml(res.request.vin)}</code></p>
  <p><strong>Контакт:</strong> ${escapeHtml(res.request.contact)}</p>
  ${
    res.promoRecord
      ? `<p><strong>Выдан PRO-код:</strong> <code style="font-size:16px;font-weight:bold;">${escapeHtml(res.promoRecord.code)}</code></p>`
      : `<p>Доступ к сохранению и записи для VIN <code>${escapeHtml(res.request.vin)}</code> открыт.</p>`
  }
  <p style="margin-top:20px;"><a href="/tools/etacs-coding" style="color:#047857;font-weight:600;">Перейти в ETACS Coding →</a></p>
</body>
</html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      return new NextResponse(
        error instanceof Error ? error.message : "Ошибка подтверждения",
        { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  }

  const vin = url.searchParams.get("vin") || "";
  const promoCode = url.searchParams.get("promoCode") || "";
  const isAdmin = await isAdminAuthenticated().catch(() => false);
  const status = await checkEtacsAccess({ vin, promoCode, isAdmin });
  return NextResponse.json(status);
}

/**
 * POST /api/etacs-coding/license
 * - { action: "redeem", code, vin, ecuId } — активировать промокод или PRO-код
 * - { action: "request", vin, ecuId, contact, plan, comment } — отправить заявку на разблокировку (с уведомлением в Telegram)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "redeem" | "request";
      code?: string;
      vin?: string;
      ecuId?: string;
      contact?: string;
      plan?: "single_vin" | "pro_month" | "pro_year";
      comment?: string;
    };

    if (body.action === "redeem") {
      const result = await redeemEtacsPromoCode({
        code: body.code || "",
        vin: body.vin,
        ecuId: body.ecuId,
      });
      return NextResponse.json(result);
    }

    if (body.action === "request") {
      const reqRecord = await createEtacsUnlockRequest({
        vin: body.vin,
        ecuId: body.ecuId,
        contact: body.contact || "",
        plan: body.plan || "single_vin",
        comment: body.comment,
      });

      const origin =
        process.env.QHUB_PUBLIC_URL?.replace(/\/$/, "") ||
        new URL(request.url).origin;
      const sig = signQuickApproveToken(reqRecord.id);
      const approveUrl = `${origin}/api/etacs-coding/license?approveId=${encodeURIComponent(reqRecord.id)}&sig=${encodeURIComponent(sig)}`;

      const planLabel =
        reqRecord.plan === "pro_year"
          ? "PRO Мастер (1 год)"
          : reqRecord.plan === "pro_month"
            ? "PRO Мастер (1 месяц)"
            : "1 Автомобиль (по VIN)";

      const tgText = [
        `🚗 <b>Заявка ETACS Coding ${escapeHtml(reqRecord.id)}</b>`,
        "",
        `<b>Тариф:</b> ${escapeHtml(planLabel)}`,
        `<b>VIN:</b> <code>${escapeHtml(reqRecord.vin)}</code>${reqRecord.ecuId ? ` (${escapeHtml(reqRecord.ecuId)})` : ""}`,
        `<b>Контакт / Kaspi:</b> ${escapeHtml(reqRecord.contact)}`,
        reqRecord.comment ? `<b>Комментарий:</b> ${escapeHtml(reqRecord.comment)}` : "",
        "",
        `👉 <a href="${approveUrl}">✅ Подтвердить доступ в 1 клик</a>`,
      ]
        .filter(Boolean)
        .join("\n");

      const topicId = getDevelopersTopicId() ?? getIdeasTopicId() ?? "1";
      await sendTelegramMessage(tgText, topicId).catch(() => null);

      return NextResponse.json({
        ok: true,
        request: reqRecord,
        message:
          "Заявка отправлена! Как только оплата будет подтверждена администратором, доступ к VIN откроется автоматически.",
      });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка запроса" },
      { status: 400 },
    );
  }
}
