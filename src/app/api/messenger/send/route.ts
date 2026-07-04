import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { MAX_ENCRYPTED_FILE_BYTES, MAX_MEDIA_RAW_BODY_BYTES, MAX_TEXT_LENGTH } from "@/lib/messenger/constants";
import { generateMessageId } from "@/lib/messenger/codes";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import type { EncryptedMessagePayload, MessageType, ReceiptPayload } from "@/lib/messenger/types";
import { pushDmEnvelope, pushRoomEnvelope, getRoomParticipants } from "@/lib/messenger/store";
import { notifyDmMessage, notifyRoomMessage } from "@/lib/messenger/push-notify";

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
    if (contentLength > MAX_MEDIA_RAW_BODY_BYTES) {
      return NextResponse.json({ error: "Слишком большой запрос" }, { status: 413 });
    }

    let body: {
      channel?: string;
      clientMessageId?: string;
      kind?: "message" | "receipt";
      type?: MessageType;
      ciphertext?: string;
      iv?: string;
      mime?: string;
      filename?: string;
      refMessageId?: string;
      receipt?: "delivered" | "read";
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const channel = body.channel ?? "";
    if (!channel) {
      return NextResponse.json({ error: "Укажите channel" }, { status: 400 });
    }
    await assertChannelParticipant(phone, channel);

    if (body.kind === "receipt") {
      const refMessageId = body.refMessageId ?? "";
      const receipt = body.receipt;
      if (!refMessageId || (receipt !== "delivered" && receipt !== "read")) {
        return NextResponse.json({ error: "Неполные данные receipt" }, { status: 400 });
      }
      const envelope: ReceiptPayload = {
        kind: "receipt",
        id: generateMessageId(),
        refMessageId,
        receipt,
        from: phone,
        ts: Date.now(),
      };
      let version: number;
      if (channel.startsWith("dm:")) {
        version = await pushDmEnvelope(channel, envelope);
      } else if (channel.startsWith("room:")) {
        version = await pushRoomEnvelope(channel.slice(5), envelope);
      } else {
        return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, messageId: envelope.id, version });
    }

    const type = body.type ?? "text";
    const ciphertext = body.ciphertext ?? "";
    const iv = body.iv ?? "";

    if (!ciphertext || !iv) {
      return NextResponse.json({ error: "Неполные данные" }, { status: 400 });
    }

    const isMedia = type === "audio" || type === "video";
    const maxCiphertextLen = isMedia ? MAX_MEDIA_RAW_BODY_BYTES : MAX_ENCRYPTED_FILE_BYTES * 2;

    if (type === "text" && ciphertext.length > MAX_TEXT_LENGTH * 2) {
      return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
    }

    if (ciphertext.length > maxCiphertextLen) {
      return NextResponse.json({ error: "Вложение слишком большое" }, { status: 413 });
    }

    const msg: EncryptedMessagePayload & { kind: "message" } = {
      kind: "message",
      id: generateMessageId(),
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId : undefined,
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
      version = await pushDmEnvelope(channel, msg);
      try {
        await notifyDmMessage({ channel, fromPhone: phone, type });
      } catch (err) {
        console.warn("[messenger/send] dm push notify failed:", err);
      }
    } else if (channel.startsWith("room:")) {
      const roomId = channel.slice(5);
      version = await pushRoomEnvelope(roomId, msg);
      const participants = await getRoomParticipants(roomId);
      try {
        await notifyRoomMessage({
          roomId,
          channel,
          fromPhone: phone,
          type,
          recipientPhones: participants.map((p) => p.phone).filter((p) => p !== phone),
        });
      } catch (err) {
        console.warn("[messenger/send] room push notify failed:", err);
      }
    } else {
      return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, messageId: msg.id, version });
  } catch (err) {
    return jsonAuthError(err);
  }
}
