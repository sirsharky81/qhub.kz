import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { MAX_RAW_BODY_BYTES, MAX_TEXT_LENGTH } from "@/lib/messenger/constants";
import { generateMessageId } from "@/lib/messenger/codes";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import type { EncryptedMessagePayload, MessageType } from "@/lib/messenger/types";
import { pushDmMessage, pushRoomMessage } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`send:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_RAW_BODY_BYTES) {
      return NextResponse.json({ error: "Слишком большой запрос" }, { status: 413 });
    }

    let body: {
      channel?: string;
      type?: MessageType;
      ciphertext?: string;
      iv?: string;
      mime?: string;
      filename?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const channel = body.channel ?? "";
    const type = body.type ?? "text";
    const ciphertext = body.ciphertext ?? "";
    const iv = body.iv ?? "";

    if (!channel || !ciphertext || !iv) {
      return NextResponse.json({ error: "Неполные данные" }, { status: 400 });
    }

    if (type === "text" && ciphertext.length > MAX_TEXT_LENGTH * 2) {
      return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
    }

    const msg: EncryptedMessagePayload = {
      id: generateMessageId(),
      from: phone,
      ts: Date.now(),
      type,
      ciphertext,
      iv,
      mime: body.mime,
      filename: body.filename,
    };

    let version: number;
    if (channel.startsWith("dm:")) {
      version = await pushDmMessage(channel, msg);
    } else if (channel.startsWith("room:")) {
      version = await pushRoomMessage(channel.slice(5), msg);
    } else {
      return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, messageId: msg.id, version });
  } catch (err) {
    return jsonAuthError(err);
  }
}
