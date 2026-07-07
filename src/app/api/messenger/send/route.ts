import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { MAX_ENCRYPTED_FILE_BYTES, MAX_MEDIA_RAW_BODY_BYTES, MAX_TEXT_LENGTH } from "@/lib/messenger/constants";
import { generateMessageId } from "@/lib/messenger/codes";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import type { EncryptedMessagePayload, MessageType, ReceiptPayload } from "@/lib/messenger/types";
import {
  applyDmUnreadOnMessage,
  applyRoomUnreadOnMessage,
  pushDmEnvelope,
  pushRoomEnvelope,
  getRoomParticipants,
  touchDmUserIndex,
} from "@/lib/messenger/store";
import { notifyDmMessage, notifyRoomMessage, sanitizePushPreview } from "@/lib/messenger/push-notify";
import { getMessengerPresence, isViewingChannel } from "@/lib/messenger/push-store";
import { peerFromDmChannel } from "@/lib/messenger/phone";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";

export async function POST(request: Request) {
  try {
    const respond = (body: unknown, status = 200, headers?: HeadersInit) => {
      void trackMessengerApiRequest("send", status);
      return NextResponse.json(body, { status, headers });
    };
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`send:${phone}`);
    if (!allowed) {
      return respond(
        { error: "Слишком много запросов" },
        429,
        retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_MEDIA_RAW_BODY_BYTES) {
      return respond({ error: "Слишком большой запрос" }, 413);
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
      pushPreview?: string;
    };
    try {
      body = await request.json();
    } catch {
      return respond({ error: "Неверный формат" }, 400);
    }

    const channel = body.channel ?? "";
    if (!channel) {
      return respond({ error: "Укажите channel" }, 400);
    }
    await assertChannelParticipant(phone, channel);

    if (body.kind === "receipt") {
      const refMessageId = body.refMessageId ?? "";
      const receipt = body.receipt;
      if (!refMessageId || (receipt !== "delivered" && receipt !== "read")) {
        return respond({ error: "Неполные данные receipt" }, 400);
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
        return respond({ error: "Неизвестный канал" }, 400);
      }
      return respond({ ok: true, messageId: envelope.id, version }, 200);
    }

    const type = body.type ?? "text";
    const ciphertext = body.ciphertext ?? "";
    const iv = body.iv ?? "";

    if (!ciphertext || !iv) {
      return respond({ error: "Неполные данные" }, 400);
    }

    const isMedia = type === "audio" || type === "video";
    const maxCiphertextLen = isMedia ? MAX_MEDIA_RAW_BODY_BYTES : MAX_ENCRYPTED_FILE_BYTES * 2;

    if (type === "text" && ciphertext.length > MAX_TEXT_LENGTH * 2) {
      return respond({ error: "Сообщение слишком длинное" }, 400);
    }

    if (ciphertext.length > maxCiphertextLen) {
      return respond({ error: "Вложение слишком большое" }, 413);
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

    const pushPreview = sanitizePushPreview(body.pushPreview);

    let version: number;
    if (channel.startsWith("dm:")) {
      version = await pushDmEnvelope(channel, msg);
      await touchDmUserIndex(channel, msg.ts);
      const peerPhone = peerFromDmChannel(channel, phone);
      const peerPresence = peerPhone ? await getMessengerPresence(peerPhone) : null;
      const recipientViewingThisChat = peerPresence ? isViewingChannel(peerPresence, channel) : false;
      await applyDmUnreadOnMessage({
        chatId: channel,
        senderPhone: phone,
        type,
        ts: msg.ts,
        recipientViewingThisChat,
      });
      try {
        await notifyDmMessage({ channel, fromPhone: phone, type, pushPreview });
      } catch (err) {
        console.warn("[messenger/send] dm push notify failed:", err);
      }
    } else if (channel.startsWith("room:")) {
      const roomId = channel.slice(5);
      version = await pushRoomEnvelope(roomId, msg);
      const participants = await getRoomParticipants(roomId);
      const otherParticipants = participants.map((p) => p.phone).filter((p) => p !== phone);
      const viewingPhones = new Set<string>();
      await Promise.all(
        otherParticipants.map(async (participantPhone) => {
          const presence = await getMessengerPresence(participantPhone);
          if (presence && isViewingChannel(presence, channel)) {
            viewingPhones.add(participantPhone);
          }
        }),
      );
      await applyRoomUnreadOnMessage({
        roomId,
        senderPhone: phone,
        type,
        ts: msg.ts,
        currentRoomVersion: version,
        participantPhones: participants.map((p) => p.phone),
        viewingPhones,
      });
      try {
        await notifyRoomMessage({
          roomId,
          channel,
          fromPhone: phone,
          type,
          recipientPhones: otherParticipants,
          pushPreview,
        });
      } catch (err) {
        console.warn("[messenger/send] room push notify failed:", err);
      }
    } else {
      return respond({ error: "Неизвестный канал" }, 400);
    }

    return respond({ ok: true, messageId: msg.id, version }, 200);
  } catch (err) {
    const res = jsonAuthError(err);
    void trackMessengerApiRequest("send", res.status);
    return res;
  }
}
